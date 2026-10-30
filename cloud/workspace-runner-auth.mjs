import {Buffer} from 'node:buffer';
export const RUNNER_REPO='xiaopong190-oss/ops-center';
export const RUNNER_WORKFLOW='publish-logistics-snapshot.yml';
export const RUNNER_AUDIENCE='ops-center-logistics-publisher';
const issuer='https://token.actions.githubusercontent.com';
let keys=null,keysAt=0;
const verifiedTokens=new Map();
const fail=()=>{throw Object.assign(Error('后台发布身份无效'),{status:403})};
export async function runnerIdentity(req,send=fetch,now=Date.now()){
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token||token.length>12000)fail();
 const cached=verifiedTokens.get(token);if(cached&&cached.exp>Math.floor(now/1000))return cached;
 let header,claims,parts;try{parts=token.split('.');if(parts.length!==3)fail();header=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'))}catch{fail()}
 const seconds=Math.floor(now/1000);
 if(header.alg!=='RS256'||typeof header.kid!=='string'||claims.iss!==issuer||claims.aud!==RUNNER_AUDIENCE||claims.repository!==RUNNER_REPO||claims.repository_id!=='1254589960'||claims.repository_owner_id!=='275407039'||claims.ref!=='refs/heads/main'||claims.workflow_ref!==RUNNER_REPO+'/.github/workflows/'+RUNNER_WORKFLOW+'@refs/heads/main'||!['workflow_dispatch','repository_dispatch'].includes(claims.event_name)||claims.runner_environment!=='github-hosted'||!/^\d+$/.test(claims.run_id||'')||!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds+30||claims.iat<seconds-600)fail();
 if(!keys||now-keysAt>300000){let r,j;try{r=await send(issuer+'/.well-known/jwks',{redirect:'manual',signal:AbortSignal.timeout(10000)})}catch{throw Object.assign(Error('RUNNER_JWKS_NETWORK'),{status:503})}if(!r.ok)throw Object.assign(Error('RUNNER_JWKS_HTTP_'+r.status),{status:503});try{j=await r.json()}catch{throw Object.assign(Error('RUNNER_JWKS_JSON'),{status:503})}if(!Array.isArray(j.keys)||j.keys.length>20)fail();keys=j.keys;keysAt=now}
 const jwk=keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&k.alg==='RS256');if(!jwk)fail();
 try{const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,Buffer.from(parts[2],'base64url'),Buffer.from(parts[0]+'.'+parts[1])))fail()}catch{fail()}
 if(verifiedTokens.size>=4)verifiedTokens.delete(verifiedTokens.keys().next().value);verifiedTokens.set(token,claims);return claims;
}
