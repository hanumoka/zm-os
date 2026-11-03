import { useState } from "react";
import type { UserView } from "@zm/platform-contracts";
import { api } from "./api";
import { Field, FormSection, SectionTitle } from "./components";
import type { RunAction } from "./types";
const passwordHint = "15~128자. 공백·한글을 사용할 수 있습니다.";
export function TrialMailNotice({url}:{url?:string}): React.JSX.Element | null {
  return url ? <p className="muted">로컬 시험에서는 메일을 외부로 발송하지 않습니다. <a href={url} target="_blank" rel="noreferrer">개발용 메일함 열기</a></p> : null;
}
export function EmailSignIn({busy,run,mailboxUrl}:{busy:boolean;run:RunAction;mailboxUrl?:string}): React.JSX.Element {
  const [mode,setMode] = useState<"login"|"signup"|"reset">("login");
  const [email,setEmail] = useState(""), [password,setPassword] = useState(""), [age,setAge] = useState(false);
  const [notice,setNotice] = useState("");
  const switchMode = (next:typeof mode):void => {setMode(next);setPassword("");setNotice("");};
  return <FormSection title={mode==="login" ? "이메일로 로그인" : mode==="signup" ? "이메일 회원가입" : "비밀번호 재설정 요청"}>
    <p>{mode==="signup" ? "이메일 인증 후 비밀번호를 설정하면 가입이 완료됩니다." : mode==="reset" ? "가입한 이메일로 재설정 링크를 요청합니다." : "인증을 완료한 이메일과 비밀번호를 입력해 주세요."}</p>
    <form onSubmit={event=>{
      event.preventDefault();
      void run(async()=>{
        if(mode==="login") {await api("/auth/email/login","POST",{email,password});setPassword("");}
        else {
          const result = await api<{message:string}>(mode==="signup" ? "/auth/email/signup" : "/auth/email/reset/request","POST",{email,...(mode==="signup" ? {ageConfirmed:age} : {})});
          setNotice(result.message);
        }
      },mode==="login" ? "이메일 계정으로 로그인했습니다." : undefined);
    }}>
      <Field label="이메일 주소"><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></Field>
      {mode==="login" && <Field label="비밀번호"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>}
      {mode==="signup" && <label className="check"><input type="checkbox" checked={age} onChange={e=>setAge(e.target.checked)} required/>만 19세 이상임을 직접 확인합니다.</label>}
      <button className="primary" disabled={busy || (mode==="signup" && !age)}>{mode==="login" ? "이메일 로그인" : mode==="signup" ? "가입 인증 메일 받기" : "재설정 메일 받기"}</button>
    </form>
    {notice && <p role="status">{notice}</p>}
    <div className="actions">
      {mode!=="login" && <button disabled={busy} onClick={()=>switchMode("login")}>이메일 로그인으로 돌아가기</button>}
      {mode!=="signup" && <button disabled={busy} onClick={()=>switchMode("signup")}>이메일 회원가입</button>}
      {mode!=="reset" && <button disabled={busy} onClick={()=>switchMode("reset")}>비밀번호 찾기</button>}
    </div><TrialMailNotice url={mailboxUrl}/>
  </FormSection>;
}
export function EmailCredentials({user,busy,run,mailboxUrl}:{user:UserView;busy:boolean;run:RunAction;mailboxUrl?:string}):React.JSX.Element {
  const [email,setEmail]=useState(""), [password,setPassword]=useState(""), [next,setNext]=useState(""), [confirm,setConfirm]=useState("");
  const [change,setChange]=useState(false), [notice,setNotice]=useState("");
  if(!user.providers.includes("email")) return <FormSection title="이메일 로그인 추가">
    <p>현재 로그인 수단으로 재인증한 뒤 이메일을 연결하세요. 다른 계정과 자동으로 합치지 않습니다.</p>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      const result=await api<{message:string}>("/me/email/link","POST",{email});setNotice(result.message);
    });}}>
      <Field label="연결할 이메일"><input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></Field>
      <button disabled={busy || user.status!=="active" || user.requiresReauth}>연결 인증 메일 받기</button>
    </form>{notice && <p role="status">{notice}</p>}<TrialMailNotice url={mailboxUrl}/>
  </FormSection>;
  return <FormSection title="이메일 비밀번호 관리">
    <p>{user.emailAddress}</p>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      if(change && next!==confirm) throw new Error("새 비밀번호와 확인 값이 다릅니다.");
      await api(change ? "/me/email/password" : "/me/email/reauth","POST",{password,...(change ? {newPassword:next} : {})});
      setPassword("");setNext("");setConfirm("");
    },change ? "비밀번호를 변경했습니다. 모든 기존 로그인이 종료되었습니다. 다시 로그인해 주세요." : "비밀번호로 재인증했습니다.");}}>
      <Field label="현재 비밀번호"><input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>
      {change && <>
        <Field label="새 비밀번호"><input type="password" required autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)}/></Field>
        <Field label="새 비밀번호 확인"><input type="password" required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field>
        <p className="muted">{passwordHint} 변경하면 다른 기기를 포함한 기존 로그인과 앱 실행 권한이 종료됩니다.</p>
      </>}
      <button disabled={busy}>{change ? "비밀번호 변경" : "비밀번호로 재인증"}</button>
    </form>
    <button disabled={busy} onClick={()=>{setChange(value=>!value);setPassword("");setNext("");setConfirm("");}}>{change ? "비밀번호 변경 취소" : "비밀번호 변경하기"}</button>
  </FormSection>;
}
export function EmailComplete({purpose,token,busy,run,onComplete}:{purpose:string;token:string;busy:boolean;run:RunAction;onComplete:()=>void}):React.JSX.Element {
  const [password,setPassword]=useState(""), [confirm,setConfirm]=useState("");
  const reset=purpose==="reset";
  return <FormSection title={reset ? "새 비밀번호 설정" : "이메일 인증과 비밀번호 설정"}>
    <SectionTitle title={reset ? "비밀번호를 다시 설정합니다" : "이메일 인증을 완료합니다"} description={purpose==="link" ? "연결을 요청한 계정과 브라우저에서 진행해 주세요." : "링크를 요청하지 않았다면 이 화면을 닫아 주세요."}/>
    <form onSubmit={e=>{e.preventDefault();void run(async()=>{
      if(password!==confirm) throw new Error("비밀번호와 확인 값이 다릅니다.");
      await api("/auth/email/complete","POST",{purpose,token,password});
      setPassword("");setConfirm("");onComplete();
    },reset ? "비밀번호를 재설정했습니다. 모든 기존 로그인이 종료되었습니다. 다시 로그인해 주세요." : purpose==="link" ? "이메일 로그인 수단을 연결했습니다." : "가입을 완료했습니다. 이메일과 비밀번호로 로그인해 주세요.");}}>
      <Field label="설정할 비밀번호"><input type="password" required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field>
      <Field label="설정할 비밀번호 확인"><input type="password" required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></Field>
      <p className="muted">{passwordHint}</p>
      {reset && <p>이전에 로그인한 모든 기기와 앱 실행 권한이 종료됩니다.</p>}
      <div className="actions"><button className="primary" disabled={busy}>{reset ? "새 비밀번호 저장" : "인증하고 비밀번호 설정"}</button><button type="button" disabled={busy} onClick={onComplete}>바탕화면으로</button></div>
    </form>
  </FormSection>;
}
