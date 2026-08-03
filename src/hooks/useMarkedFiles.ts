import { useRef, useState } from 'react';
import { commands } from '../lib/tauri-commands';

export function useMarkedFiles() {
  const [markedFiles, setMarkedFiles] = useState<Set<string>>(new Set());
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());
  // Keep a synchronous mirror so Undo can cancel an in-flight de-rez before
  // React commits the next render. Animation callbacks can then distinguish a
  // genuine completion from a file that was restored during the same frame.
  const deletingFilesRef = useRef<Set<string>>(new Set());

  const markFile = (filePath: string) => {
    setMarkedFiles(prev => new Set(prev).add(filePath));
  };

  const unmarkFile = (filePath: string) => {
    setMarkedFiles(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  };

  const clearMarked = (preservePaths: Iterable<string> = []) => {
    const preserved = new Set(preservePaths);
    setMarkedFiles(previous => new Set(
      Array.from(previous).filter(path => preserved.has(path)),
    ));
  };

  const resetMarkedState = () => {
    setMarkedFiles(new Set());
    deletingFilesRef.current = new Set();
    setDeletingFiles(new Set());
  };

  const isMarked = (filePath: string): boolean => {
    return markedFiles.has(filePath);
  };

  const startDeletion = (filePath: string) => {
    // Remove from marked, add to deleting
    setMarkedFiles(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
    const nextDeleting = new Set(deletingFilesRef.current).add(filePath);
    deletingFilesRef.current = nextDeleting;
    setDeletingFiles(nextDeleting);
  };

  const finishDeletion = (filePath: string) => {
    if (!deletingFilesRef.current.has(filePath)) return false;
    const nextDeleting = new Set(deletingFilesRef.current);
    nextDeleting.delete(filePath);
    deletingFilesRef.current = nextDeleting;
    setDeletingFiles(nextDeleting);
    return true;
  };

  const deleteAllMarked = async (
    deleteFile: (filePath: string) => Promise<unknown> = commands.moveToTrash,
    excludedPaths: Iterable<string> = [],
  ): Promise<string[]> => {
    const excluded = new Set(excludedPaths);
    const filesToDelete = Array.from(markedFiles).filter(path => !excluded.has(path));

    // Move eligible marked files to deleting state. Excluded safety-critical
    // paths are disarmed in the same commit rather than left as a stuck queue.
    setMarkedFiles(new Set());
    const nextDeleting = new Set([...deletingFilesRef.current, ...filesToDelete]);
    deletingFilesRef.current = nextDeleting;
    setDeletingFiles(nextDeleting);

    // Delete all files in parallel
    const deletePromises = filesToDelete.map(async (filePath) => {
      try {
        await deleteFile(filePath);
        return { success: true, path: filePath };
      } catch (err) {
        console.error(`Failed to delete ${filePath}:`, err);
        return { success: false, path: filePath };
      }
    });

    const results = await Promise.all(deletePromises);
    const successfulPaths = results.filter(result => result.success).map(result => result.path);
    const failedPaths = results.filter(result => !result.success).map(result => result.path);

    if (failedPaths.length > 0) {
      const remainingDeletions = new Set(deletingFilesRef.current);
      failedPaths.forEach(path => remainingDeletions.delete(path));
      deletingFilesRef.current = remainingDeletions;
      setDeletingFiles(remainingDeletions);
      setMarkedFiles(prev => new Set([...prev, ...failedPaths]));
    }

    // Note: finishDeletion will be called by FileBlocks after de-rez animation completes
    return successfulPaths;
  };

  return {
    markedFiles,
    deletingFiles,
    markFile,
    unmarkFile,
    clearMarked,
    resetMarkedState,
    isMarked,
    startDeletion,
    finishDeletion,
    deleteAllMarked,
    markedCount: markedFiles.size,
  };
}
