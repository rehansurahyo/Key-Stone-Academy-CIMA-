"use client";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function TrialStartConfirmation({ open, onOpenChange, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Start your free mock?</AlertDialogTitle>
        <AlertDialogDescription>You have one free-trial attempt. Once you start, you can resume the same attempt, but you cannot restart or take another attempt after submission. Are you sure you want to start?</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Go back</AlertDialogCancel>
        <AlertDialogAction onClick={onConfirm}>Go ahead</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
