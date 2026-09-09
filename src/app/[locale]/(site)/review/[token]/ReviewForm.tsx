"use client";

// The public review submit form: 1..5 star rating (required) + optional
// title/body/display-name + a public-consent checkbox. A client component
// so it can drive its own pending/success/error state (useTransition) and
// swap in a "thank you" panel on success without a full page reload --
// mirroring account/NotificationsPanel.tsx's shape (`.lunia-*` premium
// styling, plain useState + startTransition, no useActionState/FormData).

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { submitReviewAction } from "./actions";

interface ReviewFormProps {
  token: string;
  locale: "en" | "ar";
}

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-8 w-8"
      fill={filled ? "var(--color-gold)" : "none"}
      stroke={filled ? "var(--color-gold)" : "var(--color-ink)"}
      strokeWidth="1.4"
      strokeOpacity={filled ? 1 : 0.35}
    >
      <path
        strokeLinejoin="round"
        d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7L12 3Z"
      />
    </svg>
  );
}

export function ReviewForm({ token, locale }: ReviewFormProps) {
  const t = useTranslations("review");
  const [isPending, startTransition] = useTransition();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [consentPublic, setConsentPublic] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [alreadyUsed, setAlreadyUsed] = useState(false);
  const [success, setSuccess] = useState(false);

  const titleId = useId();
  const bodyId = useId();
  const nameId = useId();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(t("ratingRequired"));
      return;
    }
    startTransition(async () => {
      const result = await submitReviewAction({
        token,
        rating,
        title: title.trim() || undefined,
        body: body.trim() || undefined,
        authorDisplayName: name.trim() || undefined,
        consentPublic,
        locale,
      });
      if (result.ok) {
        setSuccess(true);
      } else {
        setError(result.error);
        if (result.alreadyUsed) setAlreadyUsed(true);
      }
    });
  }

  if (success || alreadyUsed) {
    return (
      <div className="lunia-card flex flex-col gap-3 p-8 text-center" data-testid="review-success">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
          {alreadyUsed ? t("alreadySubmittedHeading") : t("successHeading")}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">
          {alreadyUsed ? t("alreadySubmittedBody") : t("successBody")}
        </p>
      </div>
    );
  }

  const displayRating = hoverRating || rating;

  return (
    <form onSubmit={handleSubmit} className="lunia-card flex flex-col gap-6 p-6 sm:p-8" data-testid="review-form">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("ratingLabel")}
        </span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t("ratingLabel")}>
          {STAR_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={String(value)}
              data-testid={`review-star-${value}`}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHoverRating(value)}
              onMouseLeave={() => setHoverRating(0)}
              className="lunia-focus rounded-sm p-0.5 transition-transform hover:scale-110"
            >
              <Star filled={value <= displayRating} />
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("titleLabel")}
        </span>
        <input
          id={titleId}
          type="text"
          maxLength={150}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="lunia-input"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("bodyLabel")}
        </span>
        <textarea
          id={bodyId}
          rows={5}
          maxLength={4000}
          placeholder={t("bodyPlaceholder")}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="lunia-input resize-none"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("nameLabel")}
        </span>
        <input
          id={nameId}
          type="text"
          maxLength={120}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="lunia-input"
        />
      </label>

      <label className="flex items-start gap-3 text-sm text-[var(--color-ink)]/80">
        <input
          type="checkbox"
          checked={consentPublic}
          onChange={(e) => setConsentPublic(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-teal)]"
          data-testid="review-consent"
        />
        <span>{t("consentLabel")}</span>
      </label>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="lunia-btn lunia-btn-primary w-fit disabled:opacity-60"
          data-testid="review-submit"
        >
          {isPending ? t("submittingLabel") : t("submitLabel")}
        </button>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
