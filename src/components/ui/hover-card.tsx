import { PreviewCard as HoverCardPrimitive } from '@base-ui/react/preview-card'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const hoverCardContentVariants = cva(
  'z-50 origin-(--transform-origin) text-popover-foreground outline-none transition-[transform,opacity] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0',
  {
    variants: {
      variant: {
        default: 'w-80 rounded-xl border bg-popover p-3 shadow-md',
        list: 'w-[min(32rem,var(--available-width))] bg-transparent p-0',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

function HoverCard(props: HoverCardPrimitive.Root.Props) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger(props: HoverCardPrimitive.Trigger.Props) {
  return <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
}

function HoverCardContent({
  align = 'center',
  alignOffset = 0,
  children,
  className,
  side = 'top',
  sideOffset = 8,
  variant = 'default',
  ...props
}: HoverCardPrimitive.Popup.Props &
  Pick<HoverCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> &
  VariantProps<typeof hoverCardContentVariants>) {
  return (
    <HoverCardPrimitive.Portal>
      <HoverCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <HoverCardPrimitive.Popup
          className={cn(
            hoverCardContentVariants({ variant }),
            className,
          )}
          data-slot="hover-card-content"
          {...props}
        >
          {children}
        </HoverCardPrimitive.Popup>
      </HoverCardPrimitive.Positioner>
    </HoverCardPrimitive.Portal>
  )
}

export { HoverCard, HoverCardContent, HoverCardTrigger }
