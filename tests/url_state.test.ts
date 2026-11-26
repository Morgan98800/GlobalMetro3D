import { describe, expect, it } from 'vitest';
import { mergeAppUrlParams, parseAppUrlState } from '../web/src/ui/url_state';

describe('parseAppUrlState', () => {
  it('parses line, station, and numeric ride flag', () => {
    expect(parseAppUrlState('?line=6&station=Passy&ride=1')).toEqual({
      line: '6',
      station: 'Passy',
      ride: true,
    });
  });

  it('parses boolean ride=true and view=passenger', () => {
    expect(parseAppUrlState('?ride=true&view=passenger')).toEqual({
      ride: true,
      view: 'passenger',
    });
  });

  it('returns an empty state for an empty search string', () => {
    expect(parseAppUrlState('')).toEqual({});
  });

  it('ignores invalid view values and empty/whitespace parameters', () => {
    expect(parseAppUrlState('?line=%20%20&station=&ride=0&view=cockpit')).toEqual({});
  });

  it('trims valid line and station strings and accepts vault/ride views', () => {
    expect(parseAppUrlState('?line=%20A%20&station=%20Ch%C3%A2telet%20&view=vault')).toEqual({
      line: 'A',
      station: 'Châtelet',
      view: 'vault',
    });
    expect(parseAppUrlState('?view=ride')).toEqual({
      view: 'ride',
    });
  });
});

describe('mergeAppUrlParams', () => {
  it('preserves existing routing and simulation parameters while updating state', () => {
    const merged = mergeAppUrlParams('?rt=1&from=A&to=B&dir=0&demo-rer=1', {
      line: '6',
      station: 'Passy',
      ride: true,
      view: 'passenger',
    });

    const sp = new URLSearchParams(merged);
    expect(sp.get('rt')).toBe('1');
    expect(sp.get('from')).toBe('A');
    expect(sp.get('to')).toBe('B');
    expect(sp.get('dir')).toBe('0');
    expect(sp.get('demo-rer')).toBe('1');
    expect(sp.get('line')).toBe('6');
    expect(sp.get('station')).toBe('Passy');
    expect(sp.get('ride')).toBe('1');
    expect(sp.get('view')).toBe('passenger');
  });

  it('deletes keys on null, false, undefined, or empty string without losing preserved keys', () => {
    const merged = mergeAppUrlParams(
      '?rt=1&from=A&to=B&dir=0&line=6&station=Passy&ride=1&view=ride',
      {
        line: null,
        station: '',
        ride: false,
        view: null,
      }
    );

    expect(merged).toBe('?rt=1&from=A&to=B&dir=0');
  });

  it('returns an empty string when all parameters are removed', () => {
    const merged = mergeAppUrlParams('?ride=1&view=ride', {
      ride: false,
      view: undefined,
    });

    expect(merged).toBe('');
  });
});
