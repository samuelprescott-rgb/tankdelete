import { useState } from 'react';
import { commands } from '../lib/tauri-commands';

export function useMarkedFiles() {
  const [markedFiles, setMarkedFiles] = useState<Set<string>>(new Set());
  const [deletingFiles, setDeletingFiles] = useState<Set<string>>(new Set());

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

  const clearMarked = () => {
    setMarkedFiles(new Set());
  };

  const resetMarkedState = () => {
    setMarkedFiles(new Set());
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
    setDeletingFiles(prev => new Set(prev).add(filePath));
  };

  const finishDeletion = (filePath: string) => {
    setDeletingFiles(prev => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  };

  const deleteAllMarked = async (
    deleteFile: (filePath: string) => Promise<unknown> = commands.moveToTrash,
  ): Promise<string[]> => {
    const filesToDelete = Array.from(markedFiles);

    // Move all marked files to deleting state
    setMarkedFiles(new Set());
    setDeletingFiles(prev => new Set([...prev, ...filesToDelete]));

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
      setDeletingFiles(prev => {
        const next = new Set(prev);
        failedPaths.forEach(path => next.delete(path));
        return next;
      });
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
