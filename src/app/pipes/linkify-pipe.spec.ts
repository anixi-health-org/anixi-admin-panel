import { TestBed } from '@angular/core/testing';
import { LinkifyPipe } from './linkify-pipe';

describe('LinkifyPipe', () => {
  it('create an instance', () => {
    TestBed.configureTestingModule({
      providers: [LinkifyPipe],
    });
    const pipe = TestBed.inject(LinkifyPipe);
    expect(pipe).toBeTruthy();
  });
});
