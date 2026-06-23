import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { LogOut, Settings, User as UserIcon } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabase";
import { setTheme, useTheme } from "./theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  provider: string | null;
  team_number: string | null;
  team_program: string | null;
  theme: "light" | "dark" | "system" | null;
  onboarding_done: boolean;
};

export const AUTH_PROGRAMS = [
  { label: "V5RC", value: "1" },
  { label: "VIQRC", value: "41" },
  { label: "VURC", value: "4" },
  { label: "VAIRC", value: "57" },
];

export function programLabel(value?: string | null) {
  return AUTH_PROGRAMS.find((program) => program.value === value)?.label ?? "";
}

// Best-guess display name from OAuth metadata: Google exposes a first name
// (`given_name`); Discord exposes a global/display name or username.
export function suggestedName(user: User | null): string {
  if (!user) return "";
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (key: string) => (typeof meta[key] === "string" ? (meta[key] as string) : "");
  if (user.app_metadata?.provider === "google") {
    return str("given_name") || str("name").split(" ")[0] || str("full_name").split(" ")[0];
  }
  const claims = meta.custom_claims as Record<string, unknown> | undefined;
  const globalName = claims && typeof claims.global_name === "string" ? claims.global_name : "";
  return globalName || str("full_name") || str("name") || str("user_name");
}

function avatarFrom(profile: Profile | null, user: User | null): string {
  if (profile?.avatar_url) return profile.avatar_url;
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  return typeof meta.avatar_url === "string" ? meta.avatar_url : "";
}

type AuthValue = {
  ready: boolean;
  configured: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  signInWithDiscord: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  openProfileEditor: () => void;
  closeProfileEditor: () => void;
  profileEditorOpen: boolean;
};

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within <AuthProvider>");
  return value;
}

// Reads the user's profile row, seeding avatar/provider from OAuth metadata when
// missing, and creating the row if the signup trigger hasn't (idempotent).
async function ensureProfile(user: User): Promise<Profile | null> {
  if (!supabase) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const provider = user.app_metadata?.provider ?? null;
  const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url : null;

  const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (!existing.avatar_url && metaAvatar) patch.avatar_url = metaAvatar;
    if (!existing.provider && provider) patch.provider = provider;
    if (Object.keys(patch).length === 0) return existing as Profile;
    const { data: updated } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .maybeSingle();
    return (updated as Profile) ?? (existing as Profile);
  }

  const { data: inserted } = await supabase
    .from("profiles")
    .insert({ id: user.id, avatar_url: metaAvatar, provider, display_name: null, onboarding_done: false })
    .select("*")
    .maybeSingle();
  return (inserted as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const user = session?.user ?? null;

  useEffect(() => {
    if (!supabase) return;
    let live = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!live) return;
      setSession(nextSession);
      setReady(true);
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load the profile whenever the signed-in user changes.
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let live = true;
    ensureProfile(user).then((next) => {
      if (live) setProfile(next);
    });
    return () => {
      live = false;
    };
  }, [user?.id]);

  // Cloud-wins on load: when a signed-in profile carries a saved theme, adopt it
  // (mirrors to localStorage + applies to the DOM live). Local "system" default
  // stays untouched for signed-out / theme-less profiles.
  useEffect(() => {
    if (profile?.theme) setTheme(profile.theme);
  }, [profile?.theme]);

  const signInWith = useCallback(async (provider: "discord" | "google") => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!supabase || !user) return;
      const { data } = await supabase
        .from("profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .select("*")
        .maybeSingle();
      if (data) setProfile(data as Profile);
    },
    [user?.id],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      configured: isSupabaseConfigured,
      user,
      session,
      profile,
      signInWithDiscord: () => signInWith("discord"),
      signInWithGoogle: () => signInWith("google"),
      signOut,
      updateProfile,
      openProfileEditor: () => setProfileEditorOpen(true),
      closeProfileEditor: () => setProfileEditorOpen(false),
      profileEditorOpen,
    }),
    [ready, user, session, profile, profileEditorOpen, signInWith, signOut, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function SignedIn({ children }: { children: ReactNode }) {
  const { ready, configured, user } = useAuth();
  if (!configured || !ready || !user) return null;
  return <>{children}</>;
}

export function SignedOut({ children }: { children: ReactNode }) {
  const { ready, configured, user } = useAuth();
  if (!configured || !ready || user) return null;
  return <>{children}</>;
}

function DiscordLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

// The one reusable sign-in surface — used in the header dropdown and on the
// home page. Drop it anywhere a sign-in prompt is needed.
// SPA navigation that matches App's history-based router.
function navTo(href: string) {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function SignInButtons() {
  const { signInWithDiscord, signInWithGoogle, configured } = useAuth();
  if (!configured) return null;
  return (
    <div className="auth-buttons">
      <span className="auth-recommended">Recommended</span>
      <button type="button" className="auth-btn auth-btn-discord" onClick={() => void signInWithDiscord()}>
        <DiscordLogo />
        Sign in with Discord
      </button>
      <button type="button" className="auth-btn auth-btn-google" onClick={() => void signInWithGoogle()}>
        <GoogleLogo />
        Sign in with Google
      </button>
      <p className="auth-appearance-hint">Log in to change appearance!</p>
      <p className="auth-legal">
        By signing up you agree to our{" "}
        <a href="/terms" onClick={(e) => { e.preventDefault(); navTo("/terms"); }}>
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" onClick={(e) => { e.preventDefault(); navTo("/privacy"); }}>
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

function Avatar({ size = 32 }: { size?: number }) {
  const { user, profile } = useAuth();
  const [failed, setFailed] = useState(false);
  const src = avatarFrom(profile, user);
  const initial = (profile?.display_name || suggestedName(user) || "?").charAt(0).toUpperCase();

  if (src && !failed) {
    return (
      <img
        className="auth-avatar-img"
        src={src}
        width={size}
        height={size}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="auth-avatar-fallback" style={{ width: size, height: size }}>
      {initial}
    </span>
  );
}

export function useOutsideClick<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (event: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

// Topbar slot, right of the search box: a "Sign up / Log in" pill when signed
// out, and the avatar + menu when signed in.
export function AuthSlot() {
  const { ready, configured, user, profile, signOut, updateProfile } = useAuth();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false));

  // Theme writes go to both the global store (instant) and the cloud profile,
  // matching the Settings page.
  const chooseTheme = (value: "light" | "dark" | "system") => {
    setTheme(value);
    void updateProfile({ theme: value });
  };

  if (!configured || !ready) return null;

  if (!user) {
    return (
      <div className="auth-slot" ref={ref}>
        <button
          type="button"
          className="auth-circle-btn"
          onClick={() => setOpen((value) => !value)}
          aria-label="Sign up / Log in"
          title="Sign up / Log in"
        >
          <UserIcon size={18} />
        </button>
        {open && (
          <div className="auth-dropdown">
            <div className="auth-dropdown-title">Sign up / Log in</div>
            <SignInButtons />
          </div>
        )}
      </div>
    );
  }

  const name = profile?.display_name || suggestedName(user) || "Account";
  const team = profile?.team_number ? `${programLabel(profile.team_program)} ${profile.team_number}`.trim() : null;

  return (
    <div className="auth-slot" ref={ref}>
      <button
        type="button"
        className="auth-avatar-btn"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
      >
        <Avatar size={32} />
      </button>
      {open && (
        <div className="auth-dropdown auth-menu">
          <div className="auth-menu-head">
            <Avatar size={40} />
            <div className="auth-menu-id">
              <div className="auth-menu-name">{name}</div>
              {team && <div className="auth-menu-sub">{team}</div>}
            </div>
          </div>
          <div className="auth-menu-seg" role="group" aria-label="Theme">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`auth-seg-btn ${theme === option.value ? "active" : ""}`}
                onClick={() => chooseTheme(option.value)}
                aria-pressed={theme === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="auth-menu-item"
            onClick={() => {
              setOpen(false);
              // Route to the dedicated /settings page (mirrors App's navigate()).
              window.history.pushState(null, "", "/settings");
              window.dispatchEvent(new PopStateEvent("popstate"));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            type="button"
            className="auth-menu-item"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

const THEME_OPTIONS: Array<{ value: "light" | "dark" | "system"; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

// Onboarding doubles as the profile editor. Shows automatically once after the
// first sign-up (onboarding_done = false), or on demand from the account menu.
export function OnboardingModal() {
  const { ready, user, profile, updateProfile, profileEditorOpen, closeProfileEditor } = useAuth();
  const auto = !!(user && profile && !profile.onboarding_done);
  const visible = ready && !!user && (auto || profileEditorOpen);

  const [name, setName] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [program, setProgram] = useState("");
  const theme = useTheme(); // live preview via the global theme store
  const [saving, setSaving] = useState(false);
  const seededFor = useRef<string | null>(null);

  // Seed the form from the profile once per open.
  useEffect(() => {
    if (!visible || !user) return;
    const key = `${user.id}:${profileEditorOpen ? "edit" : "auto"}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    setName(profile?.display_name || suggestedName(user));
    setTeamNumber(profile?.team_number ?? "");
    setProgram(profile?.team_program ?? "");
  }, [visible, user, profile, profileEditorOpen]);

  const close = () => {
    seededFor.current = null;
    closeProfileEditor();
  };

  const finish = async () => {
    setSaving(true);
    await updateProfile({
      display_name: name.trim() || null,
      team_number: teamNumber.trim() || null,
      team_program: program || null,
      theme,
      onboarding_done: true,
    });
    setSaving(false);
    close();
  };

  const skip = async () => {
    if (auto) await updateProfile({ onboarding_done: true });
    close();
  };

  const editing = profileEditorOpen && !auto;

  return (
    <Dialog open={visible} onOpenChange={(o) => { if (!o) void skip(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Profile settings" : "Welcome to OpenScout"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update your details anytime. Everything here is optional."
              : "Tell us a little about you. All optional, but your name and team help personalize OpenScout."}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="onboard-name">Name</FieldLabel>
            <Input
              id="onboard-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={24}
              placeholder="Your name"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="onboard-team">Team Number</FieldLabel>
              <Input
                id="onboard-team"
                value={teamNumber}
                onChange={(event) => setTeamNumber(event.target.value.toUpperCase())}
                maxLength={10}
                placeholder="169W"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="onboard-program">Program</FieldLabel>
              <Select value={program || "none"} onValueChange={(v) => setProgram(v === "none" ? "" : v)}>
                <SelectTrigger id="onboard-program" className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {AUTH_PROGRAMS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field>
            <FieldLabel>Appearance</FieldLabel>
            <div className="theme-picker">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`theme-tile ${theme === option.value ? "active" : ""} theme-tile-${option.value}`}
                  onClick={() => setTheme(option.value)}
                  aria-pressed={theme === option.value}
                >
                  <span className="theme-wire" aria-hidden="true">
                    <span className="theme-wire-bar" />
                    <span className="theme-wire-line" />
                    <span className="theme-wire-line short" />
                  </span>
                  <span className="theme-tile-label">{option.label}</span>
                </button>
              ))}
            </div>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void skip()} disabled={saving}>
            {editing ? "Cancel" : "Skip for now"}
          </Button>
          <Button type="button" onClick={() => void finish()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Finish setup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
