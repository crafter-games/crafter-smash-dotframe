// Original move callbacks from js/characters.js, one per handler in move-handlers.ts. Reference only, not compiled.

// railly_dashattack_update (update)
update(f, sf) { if (sf < 18) f.vx = f.facing * Math.max(Math.abs(f.vx) * 0.97, 5); else f.vx = approach(f.vx, 0, 0.6); }

// railly_usmash_anim (anim)
anim(f, sf) { if (sf >= 8 && sf <= 20) return { rot: -((sf - 8) / 12) * 360 }; }

// railly_dsmash_update (update)
update(f, sf, g) {
          f.vx = approach(f.vx, 0, f.stats.traction);
          if (sf === 7) g.fx.text(f.x, f.y - 175, '$ codex "gana la pelea"', '#10a37f', 18, { life: 50, max: 50 });
          if (sf === 11) {
            Sound.play('beamSword', 0.8, 1.3); Sound.play('powershield', 0.5, 1.4);
            const mult = 1 + (f.chargeT / 60) * 0.4;
            for (const dir of [1, -1]) {
              g.spawnProjectile(f, {
                kind: 'codex', x: f.x + dir * 30, y: f.y - 58, vx: dir * 9, vy: 0, life: 30, r: 36, rect: [120, 76], dir,
                d: Math.round(15 * mult), a: 35, b: 32, k: 100, pierce: true, noReflect: true, noClash: true, fx: 'flash',
                lines: ['$ codex --auto', '> leyendo rival.js', pick(['✓ bug arreglado', '✓ 42 tests ok', '✓ PR aprobado']), '> deploy ▲'],
                update(p) { p.vx *= 0.86; if (p.life < 8) p.alpha = p.life / 8; },
                draw: drawCodexTerminal,
              });
            }
          }
        }

// railly_dsmash_drawOver (drawOver)
drawOver(ctx, f) { if (f.sf >= 3 && f.sf <= 44) drawOpenAI(ctx, f.x, f.y - 175 * SZ, 34, f.game.frame * 0.06, Math.min(1, (f.sf - 3) / 6, (46 - f.sf) / 6)); }

// railly_nspecial_update (update)
update(f, sf, g) {
          if (!f.ground && sf < 14) f.vy = Math.min(f.vy, 2.5);
          if (sf === 6) {
            g.spawnProjectile(f, { type: 'vercel', x: f.x + f.facing * 60, y: f.y - 76, vx: f.facing * 19, vy: 0, life: 44, r: 10, rot: f.facing * Math.PI / 2, d: 3, a: 0, b: 0, k: 0, noFlinch: true });
            Sound.sfx.laser();
          }
        }

// railly_sspecial_update (update)
update(f, sf, g) {
          f.noGrav = sf <= 24;
          if (sf <= 10) { f.vx *= 0.7; f.vy = 0; }
          else if (sf <= 22) {
            f.vx = f.facing * 26; f.vy = 0;
            if (sf % 2 === 0) g.fx.afterimage(f);
            if (sf % 3 === 0) g.fx.text(f.x - f.facing * 30, f.y - rand(30, 100), '▲', '#fff', 20, { vy: 0, life: 16, max: 16 });
            if (sf > 13 && f.inp.specialP) { f.sf = 22; }
          } else if (sf === 23) f.vx = f.facing * 5;
          else f.vx *= 0.88;
          if (sf === 11) Sound.sfx.dash();
        }

// railly_uspecial_update (update)
update(f, sf, g) {
          const mv = f.mv;
          if (sf <= 42) {
            f.noGrav = true; f.vx *= 0.9;
            f.vy = sf < 6 ? 0 : Math.min(f.vy + 0.08, 1.2);
            if (sf % 8 === 0) f.dynHB.push(H(sf, sf, 0, 55, 36, 2, 80, 0, 0, { fkb: 35, g: 10 + sf, fx: 'fire' }));
            if (sf % 3 === 0) g.fx.fire(f.x, f.y - 50, 1);
            if (sf === 1) Sound.sfx.fire();
          }
          if (sf === 43) {
            let dx = f.inp.x, dy = f.inp.y;
            if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
            const m = Math.hypot(dx, dy); mv.dx = dx / m; mv.dy = dy / m;
            if (mv.dx) f.facing = sgn(mv.dx);
            if (mv.dy > 0.1) f.ground = null;
            Sound.sfx.fire();
          }
          if (sf >= 43 && sf <= 70) {
            f.noGrav = true;
            f.vx = mv.dx * 17; f.vy = -mv.dy * 17;
            if (f.ground && mv.dy < 0) f.vy = 0;
            const ang = Math.atan2(mv.dy, mv.dx * f.facing) / DEG;
            f.poseRot = 90 - ang;
            f.dynHB.push(H(sf, sf, 0, 55, 34, 14, 58, 40, 92, { g: 5, fx: 'fire' }));
            g.fx.fire(f.x, f.y - 55, 2);
          }
          if (sf > 70) { f.vx *= 0.88; f.vy *= 0.8; f.poseRot = 0; }
        }

// railly_dspecial_update (update)
update(f, sf, g) {
          if (sf === 1) Sound.sfx.shine();
          f.reflecting = sf >= 1 && sf <= 36;
          if (!f.ground) { f.noGrav = sf <= 4; if (sf <= 4) f.vy = 0; else f.vy = Math.min(f.vy, 3); }
          if (f.ground) f.vx = approach(f.vx, 0, f.stats.traction * 0.8);
          if (sf >= 4 && f.inp.jumpP) { f.buf.jump = f.game.frame; f.endMove(); return; }
          if (sf === 20 && f.inp.special) f.sf = 19; // mantener el shine
        }

// railly_taunt_update (update)
update(f, sf, g) {
          f.vx = approach(f.vx, 0, 0.55);
          if (sf === 12) Sound.play('menuScroll', 0.4, 1.4);
          if (sf === 28) {
            Sound.sfx.taunt();
            g.fx.text(f.x, f.y - 155, pick(['▲ ship it', 'LGTM', 'git push -f', 'Ready ✓']), f.c.accent, 24, { life: 50, max: 50 });
          }
          if (sf > 28 && sf < 70 && sf % 7 === 0) g.fx.sparkle(f.x + f.facing * 50, f.y - 90, f.c.glow);
        }

// railly_taunt_anim (anim)
anim(f, sf) {
          if (sf < 10) return { crouch: 14 - sf * 0.4, armF: [50 + sf * 4, 110 - sf * 6], armB: [40, 100] };
          if (sf < 28) {
            // teclea
            const tap = (sf % 6 < 3);
            return { crouch: 8, lean: 6, armF: tap ? [70, 95] : [55, 105], armB: tap ? [55, 100] : [70, 90], headTilt: 8 };
          }
          if (sf < 70) {
            const pulse = Math.sin((sf - 28) * 0.25) * 4;
            return { armF: [155, -5 + pulse], armB: [-25, 45], lean: 10 + pulse * 0.3, headTilt: -14, prop: 'gun' };
          }
        }

// railly_taunt_drawOver (drawOver)
drawOver(ctx, f) {
          if (f.sf < 28 || f.sf > 72) return;
          const a = f.sf > 64 ? (72 - f.sf) / 8 : 1;
          ctx.save(); ctx.globalAlpha = a;
          drawVercel(ctx, f.x + f.facing * 58, f.y - 118 + Math.sin(f.sf * 0.3) * 4, 16, 0, true);
          ctx.restore();
        }

// railly_final_update (update)
update(f, sf, g) {
          const mv = f.mv;
          f.superArmor = true;
          f.noGrav = true;
          if (mv.caught) {
            const t = mv.caught;
            f.vx = 0; f.vy = 0;
            t.x = f.x + f.facing * 70; t.y = f.y; t.vx = t.vy = t.kvx = t.kvy = 0;
            if (t.state !== 'locked') t.setState('locked');
            t.lockedBy = f;
            mv.ct = (mv.ct || 0) + 1;
            if (mv.ct % 6 === 0 && mv.ct < 72) {
              t.percent += 2; g.fx.spark(t.x + rand(-20, 20), t.y - rand(30, 90), 1, f.c.glow);
              Sound.sfx.hit(0.7); g.shake(4); t.hurtFlash = 6;
              g.fx.text(t.x + rand(-40, 40), t.y - 130 - rand(0, 40), pick(['▲ vercel --prod', 'Ready ✓', '▲ deploy!', 'git push!', 'LGTM', 'merge!', 'CI ✓']), f.c.accent, 22);
            }
            if (mv.ct === 76) {
              t.lockedBy = null;
              t.setState('air');
              g.resolveHit(f, t, H(0, 0, 0, 0, 0, 20, 42, 120, 92, { fx: 'fire', noStale: true }), f.x, f.facing);
              g.flash('#fff', 0.8);
            }
            if (mv.ct > 90) f.endMove();
            else f.sf = 30;
            return;
          }
          if (sf === 1) { g.flash(f.c.glow, 0.5); g.banner('▲ DEPLOY A PRODUCCIÓN', f.c.main); Sound.sfx.final(); }
          if (sf <= 16) { f.vx = 0; f.vy = 0; if (sf % 2 === 0) g.fx.fire(f.x, f.y - 60, 3); }
          else if (sf <= 48) {
            f.vx = f.facing * 30; f.vy = 0;
            g.fx.afterimage(f); g.fx.fire(f.x, f.y - 55, 2);
            f.dynHB.push(H(sf, sf, 20, 55, 55, 0, 0, 0, 0, {
              g: 1, unblockable: true,
              onHit(att, tgt) { att.mv.caught = tgt; tgt.grabbedBy = null; Sound.sfx.hit(2); g.shake(12); return true; },
            }));
          } else f.vx *= 0.8;
        }

// railly_dashgrab_update (update)
update(f) { f.vx = approach(f.vx, 0, 0.35); }

// anthony_utilt_anim (anim)
anim(f, sf) { if (sf >= 6 && sf <= 14) return { armF: [60 + (sf - 6) * 16, 0] }; }

// anthony_dashattack_update (update)
update(f, sf) { f.vx = approach(f.vx, 0, sf < 16 ? 0.15 : 0.5); }

// anthony_dsmash_update (update)
update(f, sf, g) {
          f.vx = approach(f.vx, 0, f.stats.traction);
          const i = [14, 26, 38, 50].indexOf(sf);
          if (i < 0) return;
          const last = i === 3;
          f.dynHB.push(H(sf, sf + 1, 58, 12, 28, last ? 12 : 3, last ? 35 : 80, last ? 45 : 0, last ? 96 : 0, { fkb: last ? 0 : 42, g: 20 + i }));
          f.dynHB.push(H(sf, sf + 1, -58, 12, 28, last ? 12 : 3, last ? 145 : 100, last ? 45 : 0, last ? 96 : 0, { fkb: last ? 0 : 42, g: 20 + i }));
          g.fx.dust(f.x - 60, f.y, -1, 5); g.fx.dust(f.x + 60, f.y, 1, 5);
          g.fx.shockwave(f.x, f.y - 6, '#fff', last ? 130 : 70); g.shake(last ? 8 : 3);
          g.fx.text(f.x, f.y - 100, last ? '¡4! 💪' : `¡${i + 1}!`, '#ffd23f', last ? 32 : 22, { life: 30, max: 30 });
          Sound.sfx.hit(last ? 1.7 : 0.5);
        }

// anthony_nair_anim (anim)
anim(f, sf) { if (sf >= 4 && sf <= 24) return { rot: (sf - 4) * 36 }; }

// anthony_dair_anim (anim)
anim(f, sf) { if (sf >= 8 && sf <= 28) return { rot: (sf - 8) * 30 }; }

// anthony_nspecial_update (update)
update(f, sf, g) {
          const mv = f.mv;
          if (!f.ground) f.vy = Math.min(f.vy, 2);
          if (sf === 9 && f.inp.special && (mv.c || 0) < 55) {
            mv.c = (mv.c || 0) + 1; f.sf = 8;
            f.chargeFlash = true;
            if (mv.c === 1) Sound.sfx.charge();
            if (mv.c % 3 === 0) g.fx.sparkle(f.x + f.facing * 30, f.y - 110, f.c.accent);
            return;
          }
          f.chargeFlash = false;
          if (sf === 12) {
            const c = mv.c || 0;
            g.spawnProjectile(f, {
              type: 'peace', x: f.x + f.facing * 56, y: f.y - 80, vx: f.facing * (6 + c * 0.1), vy: 0, life: 90,
              r: 16 + c * 0.22, d: 5 + c * 0.22, a: 40, b: 30 + c * 0.4, k: 62 + c * 0.5, wave: true,
            });
            Sound.sfx.peace();
          }
        }

// anthony_sspecial_update (update)
update(f, sf, g) {
          if (!f.ground) { f.noGrav = sf <= 26; if (sf <= 26) f.vy *= 0.6; }
          f.vx = approach(f.vx, 0, 0.5);
          if (sf < 15 && sf % 3 === 0) g.fx.sparkle(f.x + f.facing * 14, f.y - 100, '#fff');
          if (sf === 15) Sound.sfx.beam();
          if (sf >= 15 && sf <= 22) {
            f.dynHB.push(H(sf, sf, 18, 86, 0, 8, 16, 42, 48, { rect: true, w: 400, h: 16, fx: 'beam' }));
            f.beam = sf;
          } else f.beam = 0;
        }

// anthony_uspecial_update (update)
update(f, sf, g) {
          if (sf <= 5) { f.noGrav = true; f.vy = 0; f.vx *= 0.8; }
          if (sf === 6) { f.ground = null; f.y -= 2; f.vy = -17.5; f.fastfall = false; Sound.sfx.djump(); }
          if (sf > 6 && sf <= 36) {
            f.noGrav = true; f.vy = Math.min(f.vy + 0.52, 3);
            f.vx = approach(f.vx, f.inp.x * 4.2, 0.5);
            if (sf % 5 === 0 && sf < 30) f.dynHB.push(H(sf, sf + 1, 0, 60, 38, 2, 90, 0, 0, { fkb: 42, g: 10 + sf }));
            if (sf >= 31 && sf <= 34) f.dynHB.push(H(sf, sf, 0, 60, 42, 6, 80, 55, 82, { g: 50 }));
            if (sf % 2 === 0) g.fx.swirl(f.x, f.y - 60, f.c.glow);
          }
        }

// anthony_uspecial_anim (anim)
anim(f, sf) { if (sf >= 6 && sf <= 36) return { rot: (sf - 6) * 40 }; }

// anthony_dspecial_update (update)
update(f, sf) {
          f.countering = sf >= 5 && sf <= 28;
          if (!f.ground) f.vy = Math.min(f.vy, 1.5);
          f.vx = approach(f.vx, 0, 0.5);
        }

// anthony_counterHit_update (update)
update(f, sf, g) {
          f.noGrav = !f.ground && sf < 14; if (f.noGrav) f.vy = 0;
          if (sf === 1) { g.flash('#fff', 0.9); Sound.sfx.counter(); g.fx.text(f.x, f.y - 150, '📸 ¡FLASH!', '#fff', 34); }
          if (sf === 6) f.dynHB.push(H(6, 6, 50, 60, 70, f.mv.dmg || 10, 38, 60, 82, { g: 1, fx: 'flash', noStale: true }));
          if (sf === 7) f.dynHB.push(H(7, 7, 50, 60, 70, f.mv.dmg || 10, 38, 60, 82, { g: 1, fx: 'flash', noStale: true }));
        }

// anthony_taunt_update (update)
update(f, sf, g) {
          f.vx = approach(f.vx, 0, 0.55);
          if (sf === 12) {
            Sound.sfx.peace();
            g.fx.text(f.x, f.y - 150, pick(['✌️ paz y amor', 'buena vibra', 'namasté']), f.c.accent, 24, { life: 52, max: 52 });
          }
          if (sf > 12 && sf < 75 && sf % 6 === 0) g.fx.sparkle(f.x + rand(-40, 40), f.y - rand(70, 130), f.c.glow);
        }

// anthony_taunt_anim (anim)
anim(f, sf) {
          if (sf < 12) return { crouch: 6 - sf * 0.3, armF: [40 + sf * 8, 100 - sf * 7] };
          if (sf <= 78) {
            const sway = Math.sin(sf * 0.18) * 14;
            const bob = Math.abs(Math.sin(sf * 0.22)) * 6;
            return {
              crouch: bob,
              lean: sway * 0.35,
              armF: [155 + Math.sin(sf * 0.2) * 6, -5 - bob],
              armB: [145 + Math.cos(sf * 0.2) * 6, 0 - bob * 0.5],
              headTilt: -8 + sway * 0.2,
              prop: 'peace',
            };
          }
        }

// anthony_final_update (update)
update(f, sf, g) {
          f.superArmor = true; f.invincible = Math.max(f.invincible, 2);
          if (!f.ground) { f.noGrav = true; f.vy = 0; }
          f.vx = approach(f.vx, 0, 0.6);
          if (sf === 1) { g.banner('FOTO GRUPAL', f.c.main); Sound.sfx.final(); g.photo = { owner: f, t: 0 }; }
          if (g.photo) g.photo.t = sf;
          if (sf === 20) Sound.voice('three'); if (sf === 50) Sound.voice('two'); if (sf === 80) Sound.voice('one');
          if (sf === 110) {
            Sound.sfx.counter(); g.flash('#fff', 1);
            for (const t of g.fighters) {
              if (t === f || t.state === 'dead') continue;
              const front = (t.x - f.x) * f.facing > -30;
              if (front && !t.isIntangible()) {
                g.resolveHit(f, t, H(0, 0, 0, 0, 0, 28, 55, 95, 80, { fx: 'flash', unblockable: true, noStale: true }), f.x, f.facing);
              } else if (!front) g.fx.text(t.x, t.y - 140, '¡SE ESCONDIÓ!', '#fff', 26);
            }
          }
          if (sf === 125) g.photo = null;
        }

// jibaru_nspecial_update (update)
update(f, sf, g) {
        if (!f.ground) f.vy = Math.min(f.vy, 3);
        if (sf === 9) {
          Sound.sfx.throw();
          g.spawnProjectile(f, {
            kind: 'ball', type: 'img', img: 'pokeball', h: 22, x: f.x + f.facing * 40, y: f.y - 80, vx: f.facing * 8, vy: -5, grav: 0.45, spin: f.facing * 0.4,
            life: 50, r: 11, d: 4, a: 50, b: 20, k: 40, bounce: 0, noReflect: true,
            onEnd(p, gg) { summonPokemon(f, p.x, Math.min(p.y + p.r, gg.stage.main.y), gg, f.facing); },
          });
          g.fx.text(f.x, f.y - 160, '¡Yo te elijo!', '#fff', 22);
        }
      }

// jibaru_sspecial_update (update)
update(f, sf, g) {
        CHARACTERS.railly.moves.sspecial.update(f, sf, g);
        if (sf >= 11 && sf <= 22 && sf % 2 === 0) g.fx.p({ x: f.x + rand(-20, 20), y: f.y - rand(20, 110), vx: rand(-3, 3), vy: rand(-3, 3), life: 10, size: 3, color: '#ffe23f', kind: 'line' });
        if (sf === 11) g.fx.text(f.x, f.y - 150, '¡Ataque Rápido!', '#ffe23f', 20);
      }

// jibaru_uspecial_update (update)
update(f, sf, g) {
        if (sf <= 5) { f.noGrav = true; f.vy = 0; f.vx *= 0.8; }
        if (sf === 6) { f.ground = null; f.y -= 2; f.vy = -18; f.fastfall = false; Sound.sfx.fire(); g.fx.text(f.x, f.y - 170, '¡Charizard, Vuelo!', '#ff8c1a', 20); }
        if (sf > 6 && sf <= 38) {
          f.noGrav = true; f.vy = Math.min(f.vy + 0.5, 2);
          f.vx = approach(f.vx, f.inp.x * 5, 0.6);
          if (sf % 3 === 0) g.fx.fire(f.x, f.y - 20, 1);
        }
      }

// jibaru_uspecial_drawOver (drawOver)
drawOver(ctx, f) { if (f.sf > 4 && f.sf <= 40) Items.draw(ctx, 'charizard', f.x, f.y - 150 * SZ, 120, { flip: f.facing < 0 }); }

// jibaru_dspecial_update (update)
update(f, sf, g) {
        if (!f.ground) f.vy = Math.min(f.vy, 2);
        f.vx = approach(f.vx, 0, 0.5);
        if (sf === 8) {
          if (g.countProjs(f, 'miku') === 0) spawnMiku(f, g, false);
          else { Sound.play('starRod', 0.5); g.zone(f, f.x, f.y - 60, 80, { d: 4, a: 60, b: 50, k: 30 }, 3); g.fx.shockwave(f.x, f.y - 60, '#39c5bb', 90); }
        }
      }

// jibaru_final_update (update)
update(f, sf, g) {
        f.superArmor = true; f.invincible = Math.max(f.invincible, 2);
        if (!f.ground) { f.noGrav = true; f.vy = 0; }
        f.vx = approach(f.vx, 0, 0.6);
        if (sf === 1) { g.banner('CONCIERTO DE MIKU', '#39c5bb'); Sound.sfx.final(); spawnMiku(f, g, true); }
      }

// jibaru_taunt_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.55);
        if (sf === 10) {
          Sound.play('starRod', 0.55, 1.2);
          g.fx.text(f.x, f.y - 155, pick(['♪ Miku Miku~', '¡concierto!', 'Vocaloid vibes', '♪ 39 39!']), '#39c5bb', 24, { life: 52, max: 52 });
        }
        if (sf > 10 && sf < 72 && sf % 5 === 0) {
          g.fx.text(f.x + rand(-50, 50), f.y - rand(80, 140), pick(['♪', '♫', '♬']), pick(['#39c5bb', '#ffe23f', '#fff']), 18, { life: 28, max: 28 });
        }
      }

// jibaru_taunt_anim (anim)
anim(f, sf) {
        if (sf < 12) return { crouch: 6, armF: [60 + sf * 6, 90 - sf * 4], armB: [50 + sf * 5, 85] };
        if (sf <= 74) {
          // dirige el concierto
          const beat = Math.sin(sf * 0.45);
          return {
            crouch: Math.abs(beat) * 4,
            lean: beat * 8,
            armF: [165 + beat * 10, -5 - Math.abs(beat) * 8],
            armB: [155 - beat * 12, 5 + Math.abs(beat) * 6],
            headTilt: -6 + beat * 4,
          };
        }
      }

// edward_nspecial_update (update)
update(f, sf, g) {
        if (!f.ground) f.vy = Math.min(f.vy, 2.5);
        if (sf === 10) {
          Sound.sfx.whiff();
          const img = pick(CAT_MEMES);
          g.spawnProjectile(f, { kind: 'meme', type: 'meme', img, h: 58, x: f.x + f.facing * 50, y: f.y - 90, vx: f.facing * 8.5, vy: -3, grav: 0.14, spin: f.facing * 0.12, life: 80, r: 26, d: 7, a: 45, b: 32, k: 70 });
        }
      }

// edward_sspecial_update (update)
update(f, sf, g) {
        if (!f.ground) f.vy = Math.min(f.vy, 2);
        f.vx = approach(f.vx, 0, 0.5);
        if (sf === 10) {
          Sound.play('rayGun', 0.6, 0.7); g.fx.text(f.x, f.y - 160, 'NYAN NYAN NYAN', '#ff9ab0', 20);
          const RB = ['#ff0000', '#ff9900', '#ffff00', '#33ff00', '#0099ff', '#6633ff'];
          g.spawnProjectile(f, {
            kind: 'nyan', type: 'img', img: 'cat_nyan', h: 60, x: f.x + f.facing * 50, y: f.y - 75, vx: f.facing * 11, vy: 0, life: 70, r: 24, d: 9, a: 30, b: 50, k: 62, pierce: true, flip: f.facing < 0,
            draw(ctx, p) {
              const len = Math.min(p.t * 11, 220), dir = sgn(p.vx);
              RB.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(dir > 0 ? p.x - 20 - len : p.x + 20, p.y - 18 + i * 6 + (Math.floor(p.t / 4) % 2) * 2, len, 6); });
              Items.draw(ctx, 'cat_nyan', p.x, p.y, 60, { flip: dir < 0 });
            },
          });
        }
      }

// edward_uspecial_update (update)
update(f, sf, g) {
        if (sf <= 5) { f.noGrav = true; f.vy = 0; f.vx *= 0.8; f.mv.baseY = f.y; }
        if (sf === 6) { f.ground = null; f.y -= 2; f.vy = -16.5; f.fastfall = false; Sound.sfx.djump(); g.fx.text(f.x, f.y - 160, 'LOOOOOOONGCAT', '#fff', 20); }
        if (sf > 6 && sf <= 36) {
          f.noGrav = true; f.vy = Math.min(f.vy + 0.45, 3);
          f.vx = approach(f.vx, f.inp.x * 4, 0.5);
          if (sf % 6 === 0 && sf < 30) f.dynHB.push(H(sf, sf + 1, 0, 30, 40, 3, 90, 0, 0, { fkb: 42, g: 10 + sf }));
        }
      }

// edward_uspecial_drawOver (drawOver)
drawOver(ctx, f) {
        if (f.sf < 6 || f.sf > 40 || f.mv.baseY === undefined) return;
        const top = f.y - 10, bot = Math.max(top + 40, f.mv.baseY + 20);
        const im = Items.img.cat_long; if (!im || !im.width) return;
        const w = 70;
        ctx.save(); ctx.globalAlpha = f.sf > 34 ? (40 - f.sf) / 6 : 1; ctx.imageSmoothingEnabled = true;
        ctx.drawImage(im, 0, 0, im.width, im.height * 0.35, f.x - w / 2, top, w, 60);
        ctx.drawImage(im, 0, im.height * 0.35, im.width, im.height * 0.3, f.x - w / 2, top + 60, w, Math.max(0, bot - top - 90));
        ctx.drawImage(im, 0, im.height * 0.65, im.width, im.height * 0.35, f.x - w / 2, bot - 30, w, 50);
        ctx.restore();
      }

// edward_dspecial_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.5);
        if (!f.ground) f.vy = Math.min(f.vy, 2);
        if (sf === 10) {
          const old = g.projs.find((p) => p.owner === f && p.kind === 'kbcat'); if (old) old.life = 0;
          Sound.play('starRod', 0.5, 0.8);
          const x = f.x + f.facing * 60, y = f.ground ? f.ground.y : f.y;
          g.spawnProjectile(f, {
            kind: 'kbcat', entity: true, x, y, vx: 0, vy: 0, life: 360, r: 0, grav: f.ground ? 0 : 0.6, roll: true,
            update(p, gg) {
              if (p.t % 30 === 0) gg.fx.text(p.x + rand(-20, 20), p.y - 70, pick(['♪', '♫']), '#fff', 18, { life: 30, max: 30 });
              for (const t of gg.fighters) {
                if (t === f || t.state === 'dead' || t.isIntangible()) continue;
                const h = t.hurtbox();
                if (circleRect(p.x, p.y - 30, 40, h.x, h.y, h.w, h.h)) {
                  gg.fx.text(p.x, p.y - 110, '♪ PLAY HIM OFF ♪', '#fff', 26);
                  Sound.play('starRod', 0.8, 1); Sound.sfx.hit(1.6);
                  gg.resolveHit(f, t, H(0, 0, 0, 0, 0, 13, 70, 60, 85, { noStale: true, fx: 'flash' }), p.x, sgn(t.x - p.x) || 1);
                  p.life = 0; break;
                }
              }
            },
            draw(ctx, p) { Items.draw(ctx, 'cat_keyboard', p.x, p.y + 2, 62, { anchorBottom: true, smooth: true, alpha: p.life < 30 ? p.life / 30 : 1 }); },
          });
        }
      }

// edward_final_update (update)
update(f, sf, g) {
        f.superArmor = true; f.invincible = Math.max(f.invincible, 2);
        if (!f.ground) { f.noGrav = true; f.vy = 0; }
        f.vx = approach(f.vx, 0, 0.6);
        if (sf === 1) { g.banner('LLUVIA DE MEMES', '#ff9ab0'); Sound.sfx.final(); }
        if (sf > 10 && sf < 120 && sf % 5 === 0) {
          const v = g.viewRect();
          const x = v.x + rand(0.05, 0.95) * v.w;
          g.spawnProjectile(f, { type: 'meme', img: pick(CAT_MEMES), h: rand(60, 110), x, y: v.y - 60, vx: rand(-2, 2), vy: rand(7, 11), spin: rand(-0.1, 0.1), life: 160, r: 40, d: 5, a: 70, b: 40, k: 55, pierce: true, noReflect: true, noClash: true });
          if (sf % 20 === 0) Sound.sfx.whiff();
        }
        if (sf === 125) {
          g.flash('#fff', 0.6); g.shake(12); Sound.sfx.explosion();
          g.fx.text(f.x, f.y - 220, '¿¡QUÉ!?', '#fff', 60, { life: 70, max: 70 });
          for (const t of g.fighters) if (t !== f && t.state !== 'dead' && !t.isIntangible()) g.resolveHit(f, t, H(0, 0, 0, 0, 0, 12, 50, 90, 70, { noStale: true, unblockable: true }), f.x, sgn(t.x - f.x) || 1);
        }
      }

// edward_final_drawOver (drawOver)
drawOver(ctx, f, g) { if (f.sf > 100 && f.sf < 140) { const v = g.viewRect(); Items.meme(ctx, 'cat_yelling', v.x + v.w / 2, v.y + v.h * 0.32, v.h * 0.3 * Math.min(1, (f.sf - 100) / 8), 0); } }

// edward_taunt_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.55);
        if (sf === 1) f.mv.cat = pick(['cat_bub', 'cat_grumpy', 'cat_maru']);
        if (sf === 18) {
          Sound.sfx.taunt();
          g.fx.text(f.x, f.y - 160, pick([
            '¡los gatos son lo mejor!',
            '¡mira ese gato naranja!',
            'los gatos naranjas son ley',
            '¿tienes un gato naranja?',
            'gatos naranjas >>> perros',
            'mi espíritu es un gato naranja',
          ]), '#ff9ab0', 22, { life: 52, max: 52 });
        }
        if (sf > 20 && sf < 70 && sf % 5 === 0) g.fx.sparkle(f.x + rand(-45, 45), f.y - rand(60, 140), pick(['#ff9ab0', '#ff8c1a', '#fff']));
      }

// edward_taunt_anim (anim)
anim(f, sf) {
        if (sf < 16) {
          // shrug
          return {
            crouch: 10,
            lean: -6,
            armF: [50 + sf * 2, 60],
            armB: [-50 - sf * 2, 60],
            headTilt: 8 + Math.sin(sf * 0.5) * 6,
          };
        }
        if (sf < 28) {
          const t = (sf - 16) / 12;
          return {
            crouch: lerp(10, 2, t),
            armF: [lerp(80, 140, t), lerp(60, 15, t)],
            armB: [lerp(-80, -140, t), lerp(60, 15, t)],
            headTilt: lerp(10, -6, t),
            lean: lerp(-6, 6, t),
          };
        }
        if (sf <= 74) {
          const bob = Math.sin(sf * 0.28) * 8;
          return {
            crouch: 2 + Math.abs(bob) * 0.3,
            armF: [135, 10 + bob * 0.4],
            armB: [-135, 10 - bob * 0.4],
            headTilt: -4 + bob * 0.3,
            lean: bob * 0.2,
          };
        }
      }

// edward_taunt_drawOver (drawOver)
drawOver(ctx, f) {
        if (f.sf < 16 || f.sf > 78) return;
        const t = f.sf - 16;
        const bob = Math.sin(t * 0.3) * 8;
        const a = f.sf > 70 ? (78 - f.sf) / 8 : Math.min(1, t / 6);
        Items.draw(ctx, f.mv.cat || 'cat_bub', f.x + f.facing * 52, f.y - 108 + bob, 40, { alpha: a, rot: Math.sin(t * 0.15) * 0.12 });
      }

// shiara_dashattack_update (update)
update(f, sf) { if (sf < 16) f.vx = f.facing * Math.max(Math.abs(f.vx) * 0.97, 5.5); else f.vx = approach(f.vx, 0, 0.6); }

// shiara_nspecial_update (update)
update(f, sf, g) {
        if (!f.ground) f.vy = Math.min(f.vy, 2.5);
        if (sf === 8) {
          if (g.countProjs(f, 'kirby') >= 3) { g.fx.text(f.x, f.y - 150, '¡no más Kirbys!', '#ff8ac8', 16); return; }
          Sound.sfx.throw(); Sound.play('jump', 0.5, 1.6);
          throwKirby(f, g);
        }
      }

// shiara_sspecial_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.5);
        if (!f.ground) f.vy = Math.min(f.vy, 2);
        if (sf === 8) {
          if (g.countProjs(f, 'kball') >= 1) return;
          Sound.sfx.roll();
          g.spawnProjectile(f, {
            kind: 'kball', type: 'img', frames: ['kirby_ball0', 'kirby_ball1', 'kirby_ball2', 'kirby_ball3'], fspd: 3, h: 42, flip: f.facing < 0,
            x: f.x + f.facing * 40, y: f.y - 22, vx: f.facing * 8.5, vy: 0, grav: 0.6, roll: true, life: 110, r: 20,
            d: 8, a: 35, b: 45, k: 62, pierce: true, noReflect: true,
          });
        }
      }

// shiara_uspecial_update (update)
update(f, sf, g) {
        const mv = f.mv;
        if (sf <= 5) { f.noGrav = true; f.vy = 0; f.vx *= 0.7; }
        if (sf === 6) {
          let dx = f.inp.x, dy = f.inp.y; if (Math.hypot(dx, dy) < 0.3) { dx = 0; dy = 1; }
          const m = Math.hypot(dx, dy); mv.dx = dx / m; mv.dy = Math.max(0.2, dy / m);
          if (mv.dx) f.facing = sgn(mv.dx);
          f.ground = null; f.y -= 2; Sound.play('coin', 0.6, 1.4); g.fx.text(f.x, f.y - 160, '★ ¡Estrella Warp! ★', '#ffe23f', 20);
        }
        if (sf > 6 && sf <= 34) {
          f.noGrav = true; f.vx = mv.dx * 13; f.vy = -mv.dy * 13;
          if (sf % 2 === 0) g.fx.sparkle(f.x - f.facing * 30, f.y + 10, pick(['#ffe23f', '#fff', '#ff8ac8']));
        }
        if (sf > 34) { f.vx *= 0.9; f.vy *= 0.8; }
      }

// shiara_uspecial_drawOver (drawOver)
drawOver(ctx, f) { if (f.sf > 3 && f.sf <= 38) Items.draw(ctx, 'kirby_star', f.x, f.y + 18, 46, { flip: f.facing < 0 }); }

// shiara_dspecial_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.5);
        if (!f.ground) f.vy = Math.min(f.vy, 1.5);
        if (sf === 10) {
          const words = [...SWEARS].sort(() => Math.random() - 0.5);
          Sound.sfx.hit(1.2); g.shake(6);
          Sound.say(words[0][0].replace(/[¡!]/g, ''), 1.3);
          const dirs = [[f.facing, 0], [f.facing * 0.7, -0.7], [-f.facing, -0.2]];
          words.forEach(([w, c], i) => {
            g.spawnProjectile(f, { type: 'text', text: w, color: c, size: 30, x: f.x + dirs[i][0] * 40, y: f.y - 80 + dirs[i][1] * 40, vx: dirs[i][0] * 6, vy: dirs[i][1] * 6, rot: rand(-0.2, 0.2), life: 42, r: 28, d: 5, a: 45, b: 0, k: 0, fkb: 58, dir: sgn(dirs[i][0]) || f.facing, noReflect: true, noClash: true });
          });
          g.fx.shockwave(f.x, f.y - 70, '#ffd23f', 110);
        }
      }

// shiara_final_update (update)
update(f, sf, g) {
        f.superArmor = true; f.invincible = Math.max(f.invincible, 2);
        if (!f.ground) { f.noGrav = true; f.vy = 0; }
        f.vx = approach(f.vx, 0, 0.6);
        if (sf === 1) { g.banner('LLUVIA DE KIRBYS', '#ff8ac8'); Sound.sfx.final(); Sound.say('poyo', 1.4); }
        if (sf > 8 && sf < 110 && sf % 4 === 0) {
          const v = g.viewRect();
          g.spawnProjectile(f, { kind: 'rain', type: 'img', img: pick(['kirby', 'kirby_happy']), h: 36, x: v.x + rand(0.05, 0.95) * v.w, y: v.y - 40, vx: rand(-1.5, 1.5), vy: rand(4, 7), grav: 0.3, bounce: 1, spin: rand(-0.2, 0.2), life: 150, r: 18, d: 4, a: 60, b: 30, k: 40, pierce: true, noReflect: true, noClash: true });
        }
        if (sf === 112) {
          const tg = g.fighters.find((t) => t !== f && t.state !== 'dead') || f;
          g.spawnProjectile(f, { type: 'img', img: 'kirby_big', h: 180, x: tg.x, y: g.viewRect().y - 100, vx: 0, vy: 14, grav: 0.8, life: 60, r: 80, d: 16, a: 65, b: 95, k: 80, pierce: true, noReflect: true, noClash: true,
            onHit(p, t, gg) { gg.fx.text(p.x, p.y - 120, '¡POYO!', '#ff8ac8', 48, { life: 60, max: 60 }); gg.shake(16); } });
        }
      }

// shiara_taunt_update (update)
update(f, sf, g) {
        f.vx = approach(f.vx, 0, 0.55);
        if (sf === 6) {
          Sound.sfx.taunt();
          g.fx.text(f.x, f.y - 175, pick([
            '¡mira mi Kirby!',
            'amo el rosa',
            'Kirby fan #1',
            '¿no es adorable?',
            'todo se ve mejor si tiene rosa',
            'el mejor de todos',
          ]), '#ff8ac8', 24, { life: 52, max: 52 });
        }
        if (sf > 8 && sf < 82 && sf % 4 === 0) {
          g.fx.sparkle(f.x + rand(-55, 55), f.y - rand(55, 150), pick(['#ff8ac8', '#ffe23f', '#fff', '#ffb0cc']));
        }
      }

// shiara_taunt_anim (anim)
anim(f, sf) {
        if (sf < 8) return null;
        if (sf <= 78) {
          const bob = Math.abs(Math.sin((sf - 8) * 0.38)) * 12;
          return {
            crouch: 2 + bob,
            lean: Math.sin(sf * 0.48) * 10,
            armF: [158, -8 - bob * 1.5],
            armB: [148, -4 - bob],
            headTilt: -12 - bob * 0.4,
          };
        }
      }

// shiara_taunt_drawOver (drawOver)
drawOver(ctx, f) {
        if (f.sf < 5 || f.sf > 86) return;
        const t = f.sf - 5;
        const bob = Math.sin(t * 0.35) * 10;
        const spin = Math.sin(t * 0.2) * 0.15;
        const alpha = f.sf > 78 ? (86 - f.sf) / 8 : Math.min(1, t / 5);
        const h = 46 + Math.sin(t * 0.4) * 5;
        Items.draw(ctx, 'kirby_happy', f.x + f.facing * 42, f.y - 100 + bob, h, { flip: f.facing < 0, alpha, rot: spin });
        Items.draw(ctx, 'kirby_star', f.x - f.facing * 48, f.y - 128 + bob * 0.6, 24 + Math.sin(t * 0.5) * 3, {
          alpha: alpha * 0.95, rot: t * 0.12,
        });
        if (t > 20 && t % 14 < 7) {
          Items.draw(ctx, 'kirby_star', f.x + f.facing * 70, f.y - 70 - bob, 16, { alpha: alpha * 0.7, rot: -t * 0.15 });
        }
      }
