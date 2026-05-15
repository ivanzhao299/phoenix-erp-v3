/**
 * JWT 双密钥并行轮换 — 单元测试
 *
 * 覆盖 4 个时序节点：
 *   T0  轮换前    主=OLD,  旧=空     → 用 OLD 签的 token 可解开
 *   T1  轮换中    主=NEW,  旧=OLD    → 旧 token 可解开（用户无感）
 *   T1  轮换中    主=NEW,  旧=OLD    → 新 token 可解开
 *   T2  轮换完毕  主=NEW,  旧=空     → 旧 token 必须被拒（密钥彻底失效）
 */
import * as jwt from 'jsonwebtoken';

function verifyWithRotation(token: string, current: string, prev: string): any {
  try { return jwt.verify(token, current); }
  catch (e) {
    if (prev) { try { return jwt.verify(token, prev); } catch { /* fall through */ } }
    throw e;
  }
}

describe('JWT 双密钥并行轮换', () => {
  const OLD = 'old-secret-aaa';
  const NEW = 'new-secret-bbb';
  const payload = { sub: 1, username: 'admin' };
  const tokOld = jwt.sign(payload, OLD, { expiresIn: '1h' });
  const tokNew = jwt.sign(payload, NEW, { expiresIn: '1h' });

  it('T0 轮换前：主=OLD 旧=空 → 旧 token 通过', () => {
    expect(verifyWithRotation(tokOld, OLD, '')).toMatchObject({ sub: 1 });
  });

  it('T1 轮换中：主=NEW 旧=OLD → 旧 token 通过（用户无感）', () => {
    expect(verifyWithRotation(tokOld, NEW, OLD)).toMatchObject({ sub: 1 });
  });

  it('T1 轮换中：主=NEW 旧=OLD → 新 token 通过', () => {
    expect(verifyWithRotation(tokNew, NEW, OLD)).toMatchObject({ sub: 1 });
  });

  it('T2 轮换完毕：主=NEW 旧=空 → 旧 token 被拒', () => {
    expect(() => verifyWithRotation(tokOld, NEW, '')).toThrow(jwt.JsonWebTokenError);
  });

  it('无旧 secret 时仍正常拒绝伪造 token', () => {
    const forged = jwt.sign(payload, 'attacker-key', { expiresIn: '1h' });
    expect(() => verifyWithRotation(forged, NEW, '')).toThrow(jwt.JsonWebTokenError);
    // 即便配置了 prev，伪造 token 也无法通过
    expect(() => verifyWithRotation(forged, NEW, OLD)).toThrow(jwt.JsonWebTokenError);
  });
});
