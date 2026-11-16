import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createState, transition, publicState } from '../lib/game.mjs';
import { CHRISTMAS } from '../lib/christmas.mjs';
import { transact } from '../lib/store.mjs';
const T = Date.parse('2026-11-20T12:00:00+09:00');
const refresh=(s,t)=>transition(s,{type:'refresh'},t).state;
const action=(type,t,data={})=>({type,id:randomUUID(),sentAt:t,...data});
const act=(s,type,t,data={})=>transition(s,action(type,t,data),t).state;
function pug(t=T){const s=createState(t);s.name='눈송이';s.leashColor='mint';return refresh(s,t);}
test('attendance uses KST calendar days, never grants offline days or retroactive attendance',()=>{
 let s=pug();assert.equal(s.christmas.days.length,1);s=refresh(s,T+1000);assert.equal(s.christmas.days.length,1);
 s=refresh(s,T+86400000*3);assert.equal(s.christmas.days.length,2);
 s=refresh(s,CHRISTMAS.end-1);const count=s.christmas.days.length;
 s=refresh(s,CHRISTMAS.end);assert.equal(s.christmas.days.length,count);assert.equal(publicState(s,CHRISTMAS.end).christmas.active,false);
});
test('old save migration preserves inventory, words and currency',()=>{
 const s=pug();delete s.christmas;s.progress.biscuits=333;s.progress.owned=['mint'];s.study.words=[{id:'old',term:'old',answer:'이전'}];const original=structuredClone(s);
 const updated=refresh(s,T);assert.deepEqual(s,original);delete updated.christmas;assert.deepEqual(updated,original);
});
test('walk ornament rolls are deterministic, capped daily and do not reroll on refresh',()=>{
 let s=pug();s.cheat=true;const walk=act(s,'walk',T+1000,{leashColor:'mint'});
 const bulk=refresh(walk,T+3600000);let frequent=walk;
 for(let i=1;i<=120;i++)frequent=refresh(frequent,T+1000+i*30000);
 assert.equal(bulk.christmas.decorations,6);assert.equal(frequent.christmas.decorations,6);
 assert.equal(refresh(bulk,T+3600001).christmas.decorations,6);
});
test('no drops before enrollment or after event; saved tree can be installed after end',()=>{
 let s=pug();s.christmas.decorations=29;assert.throws(()=>act(s,'christmas_tree',T+1000,{placed:true}));
 s.christmas.decorations=30;s=act(s,'christmas_tree',CHRISTMAS.end+1000,{placed:true});assert.equal(s.christmas.installed,true);
 s=act(s,'walk',CHRISTMAS.end+2000,{leashColor:'mint'});const after=refresh(s,CHRISTMAS.end+400000);assert.equal(after.christmas.decorations,30);
});
test('attendance gifts require milestones, are permanent, and cannot be claimed twice',()=>{
 let s=pug();assert.throws(()=>act(s,'christmas_claim',T+1000,{day:3}));
 s=act(s,'christmas_claim',T+1000,{day:1});s=act(s,'christmas_wear',T+2000,{item:'santa'});assert.deepEqual(s.christmas.accessories,['santa']);
 for(let i=1;i<7;i++)s=refresh(s,T+i*86400000);
 s=act(s,'christmas_claim',CHRISTMAS.end+1000,{day:3});assert.ok(s.progress.owned.includes('christmas'));
 s=act(s,'christmas_claim',CHRISTMAS.end+2000,{day:7});assert.equal(s.progress.biscuits,15);
 assert.throws(()=>act(s,'christmas_claim',CHRISTMAS.end+3000,{day:7}));
});
test('gift score is server timed, not client supplied; rewards and daily limit cannot replay',()=>{
 let s=pug();let t=T+1000;
 for(let i=0;i<3;i++){
  s=act(s,'christmas_gift_start',t);const g=s.christmas.challenge;
  assert.throws(()=>act(s,'christmas_gift_throw',t+500,{challenge:g.id,hit:true}));
  const a=action('christmas_gift_throw',g.start+1000,{challenge:g.id,hit:true,score:999});
  s=transition(s,a,a.sentAt).state;assert.equal(s.progress.biscuits,i+1);
  s=transition(s,a,a.sentAt+1000).state;assert.equal(s.progress.biscuits,i+1);t=a.sentAt+2000;
 }
 assert.throws(()=>act(s,'christmas_gift_start',t));
 assert.throws(()=>act(s,'christmas_gift_start',CHRISTMAS.end+1000));
});
test('concurrent gift reward attempts only credit once',async()=>{
 let s=act(pug(),'christmas_gift_start',T+1000),g=s.christmas.challenge;
 const store={row:{state:s,revision:0},async read(){return structuredClone(this.row)},async compareAndSwap(k,r,state){if(r!==this.row.revision)return false;this.row={state,revision:r+1};return true}};
 const a=action('christmas_gift_throw',g.start+2000,{challenge:g.id});
 await Promise.all([transact(store,'qa',a,()=>a.sentAt),transact(store,'qa',a,()=>a.sentAt)]);assert.equal(store.row.state.progress.biscuits,3);
});
