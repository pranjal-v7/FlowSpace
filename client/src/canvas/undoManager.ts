import { CanvasObject, MAX_UNDO_HISTORY } from "../shared/types.js";

export type UndoAction =
  | { type: "create"; object: CanvasObject }
  | { type: "erase"; object: CanvasObject };

export class LocalUndoManager {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private currentUserId: string | null = null;

  public setCurrentUserId(userId: string): void {
    this.currentUserId = userId;
  }

  public recordCreate(object: CanvasObject): void {
    if (this.currentUserId && object.creatorId !== this.currentUserId) return;
    this.undoStack.push({ type: "create", object });
    if (this.undoStack.length > MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public recordErase(object: CanvasObject): void {
    if (this.currentUserId && object.creatorId !== this.currentUserId) return;
    this.undoStack.push({ type: "erase", object });
    if (this.undoStack.length > MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): UndoAction | null {
    const action = this.undoStack.pop();
    if (!action) return null;
    this.redoStack.push(action);
    return action;
  }

  public redo(): UndoAction | null {
    const action = this.redoStack.pop();
    if (!action) return null;
    this.undoStack.push(action);
    return action;
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
