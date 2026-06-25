'use client';

import * as Dialog from '@radix-ui/react-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
}

export function ConfirmDialog({ open, onConfirm, onCancel, title, description }: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-zinc-950 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <Dialog.Title className="text-base font-bold text-white mb-2">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-zinc-400 mb-6">{description}</Dialog.Description>
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors"
            >
              Confirm
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
