import { Component, Input } from '@angular/core';

@Component({
  selector: 'mifosx-expandable-static-hint',
  templateUrl: './expandable-static-hint.component.html',
  styleUrls: ['./expandable-static-hint.component.scss']
})
export class ExpandableStaticHintComponent {
  @Input() label = 'Settlement rules';
  @Input() expanded = false;

  toggle(): void {
    this.expanded = !this.expanded;
  }
}
