import { Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BrlPipe, DatePipeBr, DateTimePipeBr, QtyPipe } from './util';
import { kindMaps } from './status';

@Component({
  selector: 'app-chip',
  template: `<span class="chip" [class]="info().cls">{{ info().label }}</span>`,
})
export class Chip {
  kind = input.required<string>();
  value = input<string | null | undefined>();
  info = computed(() => kindMaps[this.kind()]?.[this.value() ?? ''] ?? { label: this.value() ?? '—', cls: 's-gray' });
}

export const SHARED = [
  FormsModule, RouterLink, RouterLinkActive, MatAutocompleteModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule,
  MatIconModule, MatInputModule, MatMenuModule, MatPaginatorModule, MatProgressBarModule, MatSelectModule,
  MatSlideToggleModule, MatTooltipModule, BrlPipe, QtyPipe, DatePipeBr, DateTimePipeBr, Chip,
];
