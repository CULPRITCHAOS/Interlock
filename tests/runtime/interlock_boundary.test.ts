import { describe, it, expect, vi } from 'vitest';
import { interlockExpress } from '../../packages/interlock-express/src/index';

describe('interlock boundary', () => {
  it('express refusal prevents downstream', () => {
    const mw = interlockExpress({ dry_run: false, quality_floor: 1.1 });
    const req: any = { path: '/work', query: {}, headers: {} };
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res: any = { on: vi.fn(), statusCode: 200, status, json };
    const next = vi.fn();
    mw(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
    const body = json.mock.calls[0][0];
    expect(body.decision.law_hash).toBeTruthy();
  });

  it('streaming route unsupported', () => {
    const mw = interlockExpress({ dry_run: false });
    const req: any = { path: '/x/stream', query: {}, headers: {} };
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res: any = { on: vi.fn(), status, json };
    mw(req, res, vi.fn());
    expect(status).toHaveBeenCalledWith(501);
  });
});
