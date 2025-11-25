import { Button } from './button';
import { useOnlineStatus } from '@/shared/hooks';
import { toast } from './use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

/**
 * Button component that automatically disables when offline
 * Shows a tooltip and toast when clicked offline
 *
 * @example
 * <OnlineOnlyButton onClick={handleSave} disabledMessage="Saving requires online">
 *   Save Category
 * </OnlineOnlyButton>
 */
export function OnlineOnlyButton({
  children,
  onClick,
  disabledMessage = "This action requires internet connection",
  showTooltip = true,
  ...props
}) {
  const isOnline = useOnlineStatus();

  const handleClick = (e) => {
    if (!isOnline) {
      toast({
        title: "Offline",
        description: disabledMessage,
        variant: "destructive",
      });
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  const button = (
    <Button
      {...props}
      onClick={handleClick}
      disabled={!isOnline || props.disabled}
    >
      {children}
    </Button>
  );

  // Show tooltip when offline
  if (showTooltip && !isOnline) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {button}
          </TooltipTrigger>
          <TooltipContent>
            <p>{disabledMessage}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
