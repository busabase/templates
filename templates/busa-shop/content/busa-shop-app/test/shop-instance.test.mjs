import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createHandler } from "../src/handler.js";
import { resolveShopApp, resolveShopTables } from "../src/resources.js";
import { startFakeBusabase, TEST_KEY } from "./fake-busabase.mjs";
import { demoState, SHOP_APP_NODE } from "./fixtures.mjs";

const SITE = 'https://store.example';
const fixture = async () => {
  const state = await demoState({ source:'shop', imageUrl:(file)=>`https://images.example/${file}` });
  state.nodes.push(SHOP_APP_NODE);
  const others = state.nodes.filter((n)=>n.parentId === 'nod_shop').map((n)=>({
    ...n, id:`other_${n.id}`, parentId:'nod_other_shop', baseId:n.baseId ? `other_${n.baseId}` : null, slug:`other-${n.slug}`,
  }));
  state.nodes.push(...others);
  for (const node of others) if (node.baseId) state.records[node.baseId]=[];
  state.appUsers = {settings:{[SHOP_APP_NODE.id]:{enabled:true,appName:'Test shop'}}};
  return state;
};

describe('optional installed-shop resource binding',()=>{
  it('selects the configured Settings, Orders and login app; never falls back from a missing folder', async()=>{
    const state=await fixture();
    const tables=resolveShopTables(state.nodes,{shopFolderId:'nod_shop'});
    assert.equal(tables.settings.node.baseId,'bas_settings');
    assert.equal(tables.orders.node.baseId,'bas_orders');
    assert.equal(resolveShopApp(state.nodes,tables.settings.node.parentId).node.id,SHOP_APP_NODE.id);
    assert.equal(resolveShopTables(state.nodes).settings.status,'ambiguous');
    assert.equal(resolveShopTables(state.nodes).orders.status,'ambiguous');
    const missing=resolveShopTables(state.nodes,{shopFolderId:'nod_missing'});
    assert.equal(missing.settings.status,'missing'); assert.equal(missing.orders.status,'missing');
  });

  it('the bound HTTP handler reads and writes its own shop, while default and missing bindings fail closed',async()=>{
    const state=await fixture();
    const api=await startFakeBusabase(state);
    const env={BUSABASE_BASE_URL:api.origin,BUSABASE_API_KEY:TEST_KEY,BUSABASE_SPACE_ID:'spc_test'};
    const handler=createHandler({shopFolderId:'nod_shop'});
    const ctx={waitUntil(){}};
    const request=(path,init)=>new Request(new URL(path,SITE),init);
    try {
      const status=await (await handler(request('/api/status'),env,ctx)).json();
      assert.equal(status.setup,'ready'); assert.equal(status.accounts,'on');
      const response=await handler(request('/api/orders',{method:'POST',headers:{'content-type':'application/json',origin:SITE},body:JSON.stringify({
        orderId:'ORD-7K2M9QX4PT',name:'Test buyer',email:'test@example.com',phone:'+45 12 34 56 78',country:'DK',address1:'Example street 7',city:'Aarhus',postalCode:'8000',items:[{productId:'tt-walking-robot',quantity:2}],expectedTotal:59.9,
      })}),env,ctx);
      assert.equal(response.status,200,await response.text());
      assert.equal(state.records.bas_orders.length,1); assert.equal(state.records.other_bas_orders.length,0);
      assert.ok(api.log.every((entry)=>!String(entry.query?.baseId??'').startsWith('other_')),'never reads another shop’s tables');
      const unbound=await createHandler()(request('/api/status'),{...env},ctx);
      assert.equal((await unbound.json()).setup,'settings-ambiguous');
      const missing=await createHandler({shopFolderId:'nod_missing'})(request('/api/status'),{...env},ctx);
      assert.equal((await missing.json()).setup,'settings-missing');
    } finally {await api.close();}
  });
});
