import { Component, Inject, Injectable, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { friendly } from './api';

export interface PromptData { title: string; message?: string; label?: string; required?: boolean; minLen?: number; confirmText?: string; danger?: boolean; }

@Component({
  selector: 'app-prompt-dialog',
  imports: [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, FormsModule],
  template: `
    <h2 mat-dialog-title>{{ d.title }}</h2>
    <mat-dialog-content>
      @if (d.message) { <p>{{ d.message }}</p> }
      @if (d.label) {
        <mat-form-field class="w100" appearance="outline">
          <mat-label>{{ d.label }}</mat-label>
          <textarea matInput rows="3" [(ngModel)]="text" cdkFocusInitial></textarea>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [disabled]="invalid()" [mat-dialog-close]="d.label ? text.trim() : true">{{ d.confirmText || 'Confirmar' }}</button>
    </mat-dialog-actions>`,
})
export class PromptDialog {
  text = '';
  constructor(@Inject(MAT_DIALOG_DATA) public d: PromptData) {}
  invalid() { return !!this.d.label && this.d.required !== false && this.text.trim().length < (this.d.minLen ?? 3); }
}

@Injectable({ providedIn: 'root' })
export class Notify {
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  ok(msg: string) { this.snack.open(msg, 'OK', { duration: 3500 }); }
  err(e: any) { this.snack.open(friendly(e), 'Fechar', { duration: 8000, panelClass: 'err-snack' }); }
  async prompt(title: string, label: string, opts: Partial<PromptData> = {}): Promise<string | null> {
    const r = await this.dialog.open(PromptDialog, { data: { title, label, ...opts }, width: '440px', maxWidth: '95vw' }).afterClosed().toPromise();
    return typeof r === 'string' ? r : null;
  }
  async confirm(title: string, message: string, confirmText = 'Confirmar'): Promise<boolean> {
    const r = await this.dialog.open(PromptDialog, { data: { title, message, confirmText }, width: '440px', maxWidth: '95vw' }).afterClosed().toPromise();
    return r === true;
  }
}
