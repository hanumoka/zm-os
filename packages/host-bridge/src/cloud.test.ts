import { describe, expect, it } from 'vitest';
import { checkRequest } from './index';
import type { AppSessionView } from '@zm/platform-contracts';
const session:AppSessionView={id:'s',appId:'a',appUserId:'u',versionId:'v',expiresAt:'',documentUrl:'',manifest:{schemaVersion:1,appId:'00000000-0000-4000-8000-000000000001',version:'1.0.0',name:'시험',description:'시험',entry:'index.html',category:'tools',permissions:['cloud-storage'],apiOrigins:[],privacyNotice:'시험'}};
describe('server storage RPC contract',()=>{
  it('requires explicit cloud permission, not merely local permission',()=>{
    expect(()=>checkRequest({id:'r',method:'cloud.get',params:{key:'note'}},{...session,manifest:{...session.manifest,permissions:['local-storage']}})).toThrow();
    expect(checkRequest({id:'r',method:'cloud.get',params:{key:'note'}},session).method).toBe('cloud.get');
  });
  it('refuses caller identity and SQL-like keys',()=>{
    expect(()=>checkRequest({id:'r',method:'cloud.get',params:{key:'note',appId:'someone'}},session)).toThrow();
    expect(()=>checkRequest({id:'r',method:'cloud.get',params:{key:'../other'}},session)).toThrow();
  });
  it('requires revision, generation and a stable write request id',()=>{
    expect(()=>checkRequest({id:'r',method:'cloud.put',params:{key:'note',value:'text'}},session)).toThrow();
    expect(checkRequest({id:'r',method:'cloud.put',params:{key:'note',value:{text:'메모'},expectedRevision:0,generation:crypto.randomUUID(),requestId:crypto.randomUUID(),schemaVersion:1}},session).method).toBe('cloud.put');
  });
});
