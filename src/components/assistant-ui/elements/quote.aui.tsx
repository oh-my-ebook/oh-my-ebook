"use client";

import { memo, type ComponentProps, type FC } from "react";
import type { QuoteMessagePartComponent } from "@assistant-ui/react";
import {
  ComposerPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { QuoteIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { decodeQuoteTexts, encodeQuoteTexts } from "@/lib/quote";
import { cn } from "@/lib/utils";

function QuoteBlockRoot({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="quote-block"
      className={cn("mb-2 flex items-start gap-1.5", className)}
      {...props}
    />
  );
}

function QuoteBlockIcon({
  className,
  ...props
}: ComponentProps<typeof QuoteIcon>) {
  return (
    <QuoteIcon
      data-slot="quote-block-icon"
      className={cn(
        "text-muted-foreground/60 mt-0.5 size-3 shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function QuoteBlockText({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      data-slot="quote-block-text"
      className={cn(
        "text-muted-foreground/80 min-w-0 truncate text-sm italic",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders quoted text in user messages.
 *
 * Pass this to `MessagePrimitive.Parts` as the `Quote` renderer.
 *
 * @example
 * ```tsx
 * <MessagePrimitive.Quote>
 *   {(quote) => <QuoteBlock {...quote} />}
 * </MessagePrimitive.Quote>
 * ```
 */
const QuoteBlockImpl: QuoteMessagePartComponent = ({ text }) => {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {decodeQuoteTexts(text).map((quoteText, index) => (
        <QuoteBlockRoot
          className="bg-background/50 mb-0 h-10 w-40 max-w-full rounded-lg p-2"
          key={`${quoteText}-${index}`}
        >
          <QuoteBlockIcon />
          <QuoteBlockText>{quoteText}</QuoteBlockText>
        </QuoteBlockRoot>
      ))}
    </div>
  );
};

const QuoteBlock = memo(
  QuoteBlockImpl,
) as unknown as QuoteMessagePartComponent & {
  Root: typeof QuoteBlockRoot;
  Icon: typeof QuoteBlockIcon;
  Text: typeof QuoteBlockText;
};

QuoteBlock.displayName = "QuoteBlock";
QuoteBlock.Root = QuoteBlockRoot;
QuoteBlock.Icon = QuoteBlockIcon;
QuoteBlock.Text = QuoteBlockText;

function ComposerQuotePreviewRoot({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.Quote>) {
  return (
    <ComposerPrimitive.Quote
      data-slot="composer-quote"
      className={cn("mx-3 mt-2 flex flex-wrap gap-2", className)}
      {...props}
    />
  );
}

function ComposerQuotePreviewIcon({
  className,
  ...props
}: ComponentProps<typeof QuoteIcon>) {
  return (
    <QuoteIcon
      data-slot="composer-quote-icon"
      className={cn(
        "text-muted-foreground/70 mt-0.5 size-3.5 shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function ComposerQuotePreviewText({
  className,
  ...props
}: ComponentProps<typeof ComposerPrimitive.QuoteText>) {
  return (
    <ComposerPrimitive.QuoteText
      data-slot="composer-quote-text"
      className={cn(
        "text-muted-foreground min-w-0 flex-1 truncate text-xs",
        className,
      )}
      {...props}
    />
  );
}

function ComposerQuotePreviewDismiss({
  className,
  children,
  ...props
}: ComponentProps<typeof ComposerPrimitive.QuoteDismiss>) {
  const defaultClassName =
    "shrink-0 rounded-sm p-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground";

  return (
    <ComposerPrimitive.QuoteDismiss
      data-slot="composer-quote-dismiss"
      asChild
      className={children ? className : undefined}
      {...props}
    >
      {children ?? (
        <button
          type="button"
          aria-label="인용 삭제"
          className={cn(defaultClassName, className)}
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </ComposerPrimitive.QuoteDismiss>
  );
}

/**
 * Quote preview inside the composer. Only renders when a quote is set.
 *
 * Place inside `ComposerPrimitive.Root`.
 *
 * @example
 * ```tsx
 * <ComposerPrimitive.Root>
 *   <ComposerQuotePreview />
 *   <ComposerPrimitive.Input />
 *   <ComposerPrimitive.Send />
 * </ComposerPrimitive.Root>
 * ```
 */
const ComposerQuotePreviewImpl: FC<
  ComponentProps<typeof ComposerQuotePreviewRoot>
> = ({ className, ...props }) => {
  const assistant = useAui();
  const quote = useAuiState((state) => state.composer.quote);
  if (!quote) return null;

  const quoteMessageId = quote.messageId ?? "pdf-selection";
  const quoteTexts = decodeQuoteTexts(quote.text);

  function removeQuote(quoteIndex: number) {
    const remainingQuoteTexts = quoteTexts.filter(
      (_, index) => index !== quoteIndex,
    );
    assistant.composer.setQuote(
      remainingQuoteTexts.length > 0
        ? {
            messageId: quoteMessageId,
            text: encodeQuoteTexts(remainingQuoteTexts),
          }
        : undefined,
    );
  }

  return (
    <ComposerQuotePreviewRoot
      aria-label="첨부한 인용문"
      className={className}
      role="group"
      {...props}
    >
      {quoteTexts.map((quoteText, index) => (
        <div
          className="bg-muted/60 flex h-10 w-40 max-w-full items-start gap-1.5 rounded-lg p-2"
          key={`${quoteText}-${index}`}
        >
          <ComposerQuotePreviewIcon />
          <ComposerQuotePreviewText>{quoteText}</ComposerQuotePreviewText>
          <Button
            aria-label={
              quoteTexts.length === 1 ? "인용 삭제" : `인용 ${index + 1} 삭제`
            }
            onClick={() => removeQuote(index)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ))}
    </ComposerQuotePreviewRoot>
  );
};

const ComposerQuotePreview = memo(
  ComposerQuotePreviewImpl,
) as unknown as typeof ComposerQuotePreviewImpl & {
  Root: typeof ComposerQuotePreviewRoot;
  Icon: typeof ComposerQuotePreviewIcon;
  Text: typeof ComposerQuotePreviewText;
  Dismiss: typeof ComposerQuotePreviewDismiss;
};

ComposerQuotePreview.displayName = "ComposerQuotePreview";
ComposerQuotePreview.Root = ComposerQuotePreviewRoot;
ComposerQuotePreview.Icon = ComposerQuotePreviewIcon;
ComposerQuotePreview.Text = ComposerQuotePreviewText;
ComposerQuotePreview.Dismiss = ComposerQuotePreviewDismiss;

export {
  QuoteBlock,
  QuoteBlockRoot,
  QuoteBlockIcon,
  QuoteBlockText,
  ComposerQuotePreview,
  ComposerQuotePreviewRoot,
  ComposerQuotePreviewIcon,
  ComposerQuotePreviewText,
  ComposerQuotePreviewDismiss,
};
