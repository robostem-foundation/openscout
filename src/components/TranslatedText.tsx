import { useState } from "react";
import { Languages } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslated } from "@/translate";

// Renders one upstream string, in English when we have it.
//
// The icon's color is the entire affordance: accent-colored means you are reading
// English, grey means you are reading the original. A string with nothing to
// translate renders as bare text with no icon at all, and so does a string whose
// translation failed — a dead control that does nothing when clicked is worse
// than no control.
//
// The per-string toggle is deliberately ephemeral component state: it resets on
// navigation. Persisting dozens of individual toggles is not worth the storage,
// and the global Translate Mode setting already covers "I always want originals."

export function TranslatedText({
  text,
  country,
  className,
}: {
  text: string | null | undefined;
  country?: string | null;
  className?: string;
}) {
  const { translated, status, translatable, request } = useTranslated(text, country);
  const [showOriginal, setShowOriginal] = useState(false);

  const original = text ?? "";
  if (!translatable || status === "failed") return <span className={className}>{original}</span>;

  const hasEnglish = status === "ready" && translated !== null;
  const showingEnglish = hasEnglish && !showOriginal;
  const pending = status === "pending";

  const label = showingEnglish ? "Show original" : "Show translation";

  const onClick = () => {
    // Manual mode: the first click is what fetches. `request()` is a no-op once
    // a translation exists, so the same handler covers both modes.
    if (!hasEnglish) {
      request();
      setShowOriginal(false);
      return;
    }
    setShowOriginal((value) => !value);
  };

  return (
    <span className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`translate-toggle ${showingEnglish ? "is-english" : ""} ${pending ? "is-pending" : ""}`}
            onClick={onClick}
            aria-label={pending ? "Translating…" : label}
            aria-pressed={showingEnglish}
          >
            <Languages size={13} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{pending ? "Translating…" : label}</TooltipContent>
      </Tooltip>
      {showingEnglish ? translated : original}
    </span>
  );
}
