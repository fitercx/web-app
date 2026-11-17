import { TestBed, waitForAsync } from '@angular/core/testing';
import { SettingsService } from 'app/settings/settings.service';
import { DateFormatPipe } from './date-format.pipe';

describe('DateFormatPipe', () => {
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [SettingsService],
      declarations: [DateFormatPipe]
    }).compileComponents();
  }));

  it('create an instance', () => {
    const pipe = new DateFormatPipe(new SettingsService(null, null));
    expect(pipe).toBeTruthy();
  });

  it('formats audit timestamps that are already epoch milliseconds', () => {
    const pipe = new DateFormatPipe(settingsWithFormat('dd MMMM yyyy'));
    // 2026-11-04T06:24:09.000Z — the value GET /audits sends for madeOnDate
    expect(pipe.transform(1793773449000, 'YYYY')).toBe('2026');
    expect(pipe.transform(1793773449000, 'DD MMMM YYYY')).not.toContain('58812');
  });

  it('still treats unix seconds as seconds', () => {
    const pipe = new DateFormatPipe(settingsWithFormat('dd MMMM yyyy'));
    expect(pipe.transform(1793773449, 'YYYY')).toBe('2026');
  });

  it('still formats fineract date arrays', () => {
    const pipe = new DateFormatPipe(settingsWithFormat('dd MMMM yyyy'));
    expect(
      pipe.transform(
        [
          2026,
          11,
          4
        ],
        'DD MMMM YYYY'
      )
    ).toBe('04 November 2026');
  });
});

function settingsWithFormat(dateFormat: string): SettingsService {
  return {
    dateFormat,
    language: { code: 'en' }
  } as SettingsService;
}
