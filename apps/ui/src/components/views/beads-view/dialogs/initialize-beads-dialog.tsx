/**
 * Initialize Beads Dialog
 *
 * Dialog shown when Beads is not initialized in a project.
 * Offers one-click initialization with loading state support.
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface InitializeBeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectPath: string;
  onInitialize: () => Promise<void>;
  isInitializing?: boolean;
}

export function InitializeBeadsDialog({
  open,
  onOpenChange,
  projectPath,
  onInitialize,
  isInitializing = false,
}: InitializeBeadsDialogProps) {
  const handleInitialize = async () => {
    await onInitialize();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Initialize Beads</DialogTitle>
          <DialogDescription>
            Beads issue tracking is not initialized in this project. Would you like to initialize it
            now?
            {projectPath && (
              <>
                <br />
                <span className="text-muted-foreground text-xs mt-2 block">
                  Project: {projectPath}
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isInitializing}>
            Cancel
          </Button>
          <Button onClick={handleInitialize} disabled={isInitializing}>
            {isInitializing ? 'Initializing...' : 'Initialize'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
