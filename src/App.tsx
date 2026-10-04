import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays, ChartNoAxesColumnIncreasing, Check, ChevronDown, CirclePlus, Clock3,
  Copy, Download, House, PiggyBank, Printer, RotateCcw, Trash2, TrendingDown,
  X,
} from 'lucide-react'
import {
  calculateScenario, formatDuration, type Frequency, type LoanTerms,
  type PrepaymentPlan, type ScenarioResult, type Strategy,
} from './lib/calculator'
import './App.css'
import './features.css'

const money = new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', maximumFractionDigits:0 })
const exactMoney = new Intl.NumberFormat('ru-RU', { style:'currency', currency:'RUB', minimumFractionDigits:2 })
const dateFormat = new Intl.DateTimeFormat('ru-RU')
const STORAGE_KEY = 'mortgage-planner-scenarios-v1'

type Scenario = { id:string; name:string; terms:LoanTerms; plans:PrepaymentPlan[] }
const initialTerms:LoanTerms = { propertyPrice:12_000_000, downPayment:3_000_000, annualRate:12.5, years:20, issueDate:'2026-10-04', firstPaymentDate:'2026-11-04' }
const initialScenario:Scenario = { id:'base', name:'Базовый сценарий', terms:initialTerms, plans:[] }

function loadScenarios():Scenario[]{
  try { const saved=localStorage.getItem(STORAGE_KEY); return saved?JSON.parse(saved):[initialScenario] } catch { return [initialScenario] }
}
const uid=()=>Math.random().toString(36).slice(2,9)

function App(){
  const [scenarios,setScenarios]=useState<Scenario[]>(loadScenarios)
  const [activeId,setActiveId]=useState(()=>loadScenarios()[0]?.id??'base')
  const [compareIds,setCompareIds]=useState<string[]>([])
  const [saved,setSaved]=useState(true)
  const [chartScenarioId,setChartScenarioId]=useState(activeId)
  const [plansOpen,setPlansOpen]=useState(false)
  const plansDialogRef=useRef<HTMLDialogElement>(null)
  const active=scenarios.find(s=>s.id===activeId)??scenarios[0]??initialScenario
  const result=useMemo(()=>calculateScenario(active.terms,active.plans),[active])
  const baseline=useMemo(()=>calculateScenario(active.terms,[]),[active.terms])
  const allResults=useMemo(()=>new Map(scenarios.map(s=>[s.id,calculateScenario(s.terms,s.plans)])),[scenarios])
  const chartScenario=scenarios.find(s=>s.id===chartScenarioId)??active
  const chartResult=allResults.get(chartScenario.id)??result

  useEffect(()=>{ setSaved(false); const timer=window.setTimeout(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(scenarios));setSaved(true)},300); return()=>clearTimeout(timer) },[scenarios])
  useEffect(()=>{ if(!scenarios.some(s=>s.id===chartScenarioId))setChartScenarioId(activeId) },[scenarios,chartScenarioId,activeId])
  useEffect(()=>{
    const dialog=plansDialogRef.current
    if(!dialog)return
    if(plansOpen&&!dialog.open)dialog.showModal()
    if(!plansOpen&&dialog.open)dialog.close()
  },[plansOpen])

  useEffect(()=>{
    const modelContext=(document as Document & {modelContext?:{registerTool:(tool:unknown,options?:unknown)=>void|Promise<void>}}).modelContext
    if(!modelContext?.registerTool)return
    const lifecycle=new AbortController()
    void Promise.resolve(modelContext.registerTool({name:'set_mortgage_terms',title:'Задать условия ипотеки',description:'Обновляет видимые условия активного ипотечного сценария.',inputSchema:{type:'object',properties:{propertyPrice:{type:'number'},downPayment:{type:'number'},annualRate:{type:'number'},years:{type:'integer'}},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:(input:unknown)=>{const patch=input as Partial<LoanTerms>;setScenarios(current=>current.map(s=>s.id===activeId?{...s,terms:{...s.terms,...patch}}:s));return{updated:true}}},{signal:lifecycle.signal})).catch(()=>undefined)
    return()=>lifecycle.abort()
  },[activeId])

  const updateScenario=(patch:Partial<Scenario>)=>setScenarios(list=>list.map(s=>s.id===activeId?{...s,...patch}:s))
  const updateTerms=<K extends keyof LoanTerms>(key:K,value:LoanTerms[K])=>updateScenario({terms:{...active.terms,[key]:value}})
  const updatePlan=(id:string,patch:Partial<PrepaymentPlan>)=>updateScenario({plans:active.plans.map(p=>p.id===id?{...p,...patch}:p)})
  const addPlan=()=>updateScenario({plans:[...active.plans,{id:uid(),amount:50_000,frequency:'monthly',strategy:'term',startDate:active.terms.firstPaymentDate,endDate:'',enabled:true}]})
  const removePlan=(id:string)=>updateScenario({plans:active.plans.filter(p=>p.id!==id)})
  const copyPlan=(id:string)=>{const source=active.plans.find(p=>p.id===id);if(source)updateScenario({plans:[...active.plans,{...source,id:uid()}]})}
  const duplicateScenario=()=>{const copy:{id:string;name:string;terms:LoanTerms;plans:PrepaymentPlan[]}={...active,id:uid(),name:`${active.name} — копия`,terms:{...active.terms},plans:active.plans.map(p=>({...p,id:uid()}))};setScenarios(list=>[...list,copy]);setActiveId(copy.id);setChartScenarioId(copy.id)}
  const resetAll=()=>{if(window.confirm('Удалить все сценарии и вернуть пример?')){setScenarios([initialScenario]);setActiveId('base');setCompareIds([])}}

  const toggleCompare=(id:string)=>setCompareIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):ids.length<4?[...ids,id]:ids)
  const exportedRows=result.schedule.map(row=>[row.date,row.type==='regular'?'Обязательный':'Досрочный',row.regularPayment,row.extraPayment,row.totalPayment,row.interest,row.regularPrincipal,row.extraPrincipal,row.balance,row.paymentAfter,row.remainingMonths].join(';'))
  const exportCsv=()=>{const header='Дата;Тип;Обязательный платёж;Досрочный платёж;Всего;Проценты;Тело обязательно;Тело досрочно;Остаток;Новый платёж;Осталось месяцев';const blob=new Blob(['\uFEFF',header,'\n',...exportedRows.map(r=>`${r}\n`)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`${active.name.replaceAll(' ','-')}.csv`;link.click();URL.revokeObjectURL(url)}

  const years=groupByYear(result.schedule)
  const principal=Math.max(0,active.terms.propertyPrice-active.terms.downPayment)
  const downPercent=active.terms.propertyPrice>0?(active.terms.downPayment/active.terms.propertyPrice)*100:0
  const savedMonths=Math.max(0,baseline.durationMonths-result.durationMonths)
  const interestSaved=Math.max(0,baseline.totalInterest-result.totalInterest)
  const invalid=active.terms.downPayment>active.terms.propertyPrice||active.terms.propertyPrice<=0||active.terms.firstPaymentDate<=active.terms.issueDate
  const chartTotal=Math.max(1,chartResult.totalPaid)
  const chartSlices=[chartResult.regularPrincipal,chartResult.extraPrincipal,chartResult.totalInterest]
  const firstAngle=(chartSlices[0]/chartTotal)*360
  const secondAngle=firstAngle+(chartSlices[1]/chartTotal)*360

  return <div className={`app-shell ${plansOpen?'modal-open':''}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark"><House size={19}/></span><div><strong>Ипотечный планировщик</strong><span>Личный расчёт сценариев</span></div></div><div className="topbar-actions"><label className="scenario-picker"><span className="scenario-dot"/><select value={activeId} onChange={e=>{setActiveId(e.target.value);setChartScenarioId(e.target.value)}}>{scenarios.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={16}/></label><span className={`save-state ${saved?'is-saved':''}`}>{saved?'Сохранено':'Сохраняем…'}</span></div></header>
    {!plansOpen&&<div className="sticky-payment" aria-live="polite"><div className="sticky-payment-metric"><span>Текущий платёж</span><strong>{exactMoney.format(result.currentPayment)}</strong></div><i/><div className="sticky-payment-metric"><span>Срок до закрытия</span><strong>{formatDuration(result.durationMonths)}</strong></div></div>}
    <main>
      <section className="page-heading"><div><p className="eyebrow">Личный расчёт</p><h1>Когда ипотека станет вашей квартирой</h1></div><div className="heading-actions"><button className="ghost-button" onClick={duplicateScenario}><Copy size={16}/>Создать копию</button><button className="ghost-button danger" onClick={resetAll}><RotateCcw size={16}/>Сбросить всё</button></div></section>
      <section className="workspace">
        <div className="form-card card"><div className="card-heading"><div><span className="step">01</span><h2>Условия кредита</h2></div><span className={`status-pill ${invalid?'error':''}`}>{invalid?'Проверьте данные':'Заполнено'}</span></div><label className="field scenario-name"><span>Название сценария</span><div className="input-shell"><input value={active.name} onChange={e=>updateScenario({name:e.target.value})}/></div></label><div className="form-grid">
          <NumberField label="Стоимость жилья" value={active.terms.propertyPrice} suffix="₽" onChange={v=>updateTerms('propertyPrice',v)} wide/>
          <NumberField label="Первоначальный взнос" value={active.terms.downPayment} suffix="₽" onChange={v=>updateTerms('downPayment',v)} wide hint={`${downPercent.toFixed(1).replace('.',',')} % от стоимости`}/>
          <NumberField label="Ставка" value={active.terms.annualRate} suffix="%" step="0.1" onChange={v=>updateTerms('annualRate',v)}/>
          <NumberField label="Срок" value={active.terms.years} suffix="лет" onChange={v=>updateTerms('years',v)}/>
          <DateField label="Дата выдачи" value={active.terms.issueDate} onChange={v=>updateTerms('issueDate',v)}/><DateField label="Первый платёж" value={active.terms.firstPaymentDate} onChange={v=>updateTerms('firstPaymentDate',v)}/>
        </div><div className="loan-principal"><span>Сумма кредита</span><strong>{money.format(principal)}</strong></div></div>
        <div className="result-card card"><div className="result-topline"><span className="live-indicator"><i/> Живой расчёт</span><span>{active.plans.filter(p=>p.enabled).length?`${active.plans.filter(p=>p.enabled).length} плана`:'Без досрочных платежей'}</span></div><div className="payoff-hero"><p>Вы закроете ипотеку за</p><h2>{formatDuration(result.durationMonths)}</h2><div className="payoff-date"><CalendarDays size={19}/>Последний платёж — <strong>{dateFormat.format(result.payoffDate)}</strong></div></div><div className="result-metrics"><Metric icon={<PiggyBank size={17}/>} label="Текущий платёж" value={exactMoney.format(result.currentPayment)}/><Metric icon={<TrendingDown size={17}/>} label="Экономия процентов" value={money.format(interestSaved)} accent/><Metric icon={<Clock3 size={17}/>} label="Срок сокращён" value={formatDuration(savedMonths)}/></div><div className="progress-block"><div><span>Проценты по сценарию</span><b>{money.format(result.totalInterest)}</b></div><div className="progress-track"><span style={{width:`${Math.min(100,(result.principal/Math.max(result.totalPaid,1))*100)}%`}}/></div><p>Базовая дата: {dateFormat.format(baseline.payoffDate)} · Базовые проценты: {money.format(baseline.totalInterest)}</p></div></div>
      </section>

      <section className="prepayment-launcher card"><div className="prepayment-launcher-copy"><span className="step">02</span><div><h2>Досрочное погашение</h2><p>{active.plans.length?`Активных планов: ${active.plans.filter(plan=>plan.enabled).length} из ${active.plans.length}`:'Планы досрочных платежей не настроены'}</p></div></div><button className="primary-button" onClick={()=>setPlansOpen(true)}><PiggyBank size={18}/>Выбрать досрочное погашение</button></section>

      <dialog ref={plansDialogRef} className="plans-dialog" onClose={()=>setPlansOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setPlansOpen(false)}}><div className="plans-modal"><div className="plans-modal-header"><div><span className="step">02</span><div><h2>Досрочное погашение</h2><p>Настройте один или несколько планов</p></div></div><button className="icon-button" aria-label="Закрыть" onClick={()=>setPlansOpen(false)}><X size={20}/></button></div><div className="plans-modal-body">{!active.plans.length?<div className="empty-state"><PiggyBank size={30}/><strong>Пока без досрочных платежей</strong><span>Добавьте первый план, чтобы увидеть новую дату закрытия и экономию.</span></div>:<div className="plans-grid">{active.plans.map((plan,index)=><PlanCard key={plan.id} plan={plan} number={index+1} onChange={patch=>updatePlan(plan.id,patch)} onCopy={()=>copyPlan(plan.id)} onRemove={()=>removePlan(plan.id)}/>)}</div>}{result.conflicts.length>0&&<div className="conflict">На одну дату назначены планы с разными способами пересчёта: {result.conflicts.map(d=>dateFormat.format(new Date(`${d}T00:00:00Z`))).join(', ')}.</div>}</div><div className="plans-modal-footer"><button className="ghost-button add-plan-button" onClick={addPlan}><CirclePlus size={18}/>Добавить план</button><button className="primary-button" onClick={()=>setPlansOpen(false)}>Готово</button></div></div></dialog>

      <section className="insights-grid">
        <div className="summary-card card"><div className="section-heading compact"><div><span className="step">03</span><h2>Итоги сценария</h2></div></div><div className="summary-grid"><Summary label="Первоначальный платёж" value={exactMoney.format(result.monthlyPayment)}/><Summary label="Текущий платёж" value={exactMoney.format(result.currentPayment)}/><Summary label="Досрочно внесено" value={money.format(result.totalExtra)}/><Summary label="Всего процентов" value={money.format(result.totalInterest)}/><Summary label="Экономия" value={money.format(interestSaved)} positive/><Summary label="Максимум за месяц" value={money.format(result.maxMonthlyPayment)}/></div></div>
        <div className="donut-card card"><div className="donut-heading"><div><h2>Структура выплат</h2><select value={chartScenario.id} onChange={e=>setChartScenarioId(e.target.value)}>{scenarios.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="donut-content"><div className="donut" style={{background:`conic-gradient(#138d4d 0deg ${firstAngle}deg,#70d897 ${firstAngle}deg ${secondAngle}deg,#d9b44a ${secondAngle}deg 360deg)`}}><div><span>Всего выплат</span><strong>{money.format(chartResult.totalPaid)}</strong></div></div><div className="legend"><Legend color="#138d4d" label="Тело — обязательными" value={money.format(chartResult.regularPrincipal)}/><Legend color="#70d897" label="Тело — досрочно" value={money.format(chartResult.extraPrincipal)}/><Legend color="#d9b44a" label="Проценты" value={money.format(chartResult.totalInterest)}/></div></div></div>
      </section>

      <section className="comparison card"><div className="section-heading"><div><span className="step">04</span><div><h2>Сравнение сценариев</h2><p>Выберите до четырёх вариантов</p></div></div><button className="ghost-button" onClick={duplicateScenario}><Copy size={16}/>Копировать текущий</button></div><div className="scenario-chips">{scenarios.map(s=><button key={s.id} className={compareIds.includes(s.id)?'selected':''} onClick={()=>toggleCompare(s.id)}><span>{compareIds.includes(s.id)&&<Check size={14}/>}</span>{s.name}</button>)}</div>{compareIds.length>0?<ComparisonTable scenarios={scenarios.filter(s=>compareIds.includes(s.id))} results={allResults}/>:<div className="comparison-empty"><ChartNoAxesColumnIncreasing size={22}/>Выберите сценарии для сравнения</div>}</section>

      <section className="schedule card"><div className="section-heading"><div><span className="step">05</span><div><h2>Подробный график</h2><p>{result.schedule.length} операций · группировка по годам</p></div></div><div className="table-actions"><button className="ghost-button" onClick={exportCsv}><Download size={16}/>CSV</button><button className="ghost-button" onClick={()=>window.print()}><Printer size={16}/>PDF</button></div></div><div className="years">{[...years.entries()].map(([year,rows],index)=><ScheduleYear key={year} year={year} rows={rows} defaultOpen={index===0}/>)}</div></section>
      <p className="disclaimer">Расчёт является прогнозным и может отличаться от графика конкретного банка и условий кредитного договора.</p>
    </main>
  </div>
}

function NumberField({label,value,suffix,onChange,wide,hint,step}: {label:string;value:number;suffix:string;onChange:(v:number)=>void;wide?:boolean;hint?:string;step?:string}){
  const inputRef=useRef<HTMLInputElement>(null)
  const [draft,setDraft]=useState(String(value).replace('.',','))
  useEffect(()=>{if(document.activeElement!==inputRef.current)setDraft(String(value).replace('.',','))},[value])
  const decimal=Boolean(step)
  const handleChange=(raw:string)=>{
    const pattern=decimal?/^\d*(?:[.,]\d*)?$/:/^\d*$/
    if(!pattern.test(raw))return
    setDraft(raw)
    if(raw===''||raw.endsWith('.')||raw.endsWith(','))return
    const parsed=Number(raw.replace(',','.'))
    if(Number.isFinite(parsed))onChange(parsed)
  }
  const handleBlur=()=>{
    if(draft===''){setDraft('0');onChange(0);return}
    const parsed=Number(draft.replace(',','.'))
    if(Number.isFinite(parsed)){onChange(parsed);setDraft(String(parsed).replace('.',','))}
  }
  return <label className={`field ${wide?'field-wide':''}`}><span>{label}</span><div className="input-shell"><input ref={inputRef} type="text" inputMode={decimal?'decimal':'numeric'} value={draft} onChange={e=>handleChange(e.target.value)} onBlur={handleBlur}/><b>{suffix}</b></div>{hint&&<small>{hint}</small>}</label>
}
function DateField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="field"><span>{label}</span><div className="input-shell date-input"><input type="date" value={value} onChange={e=>onChange(e.target.value)}/></div></label>}
function Metric({icon,label,value,accent}:{icon:React.ReactNode;label:string;value:string;accent?:boolean}){return <article className={accent?'accent':''}><span>{icon}{label}</span><strong>{value}</strong></article>}
function Summary({label,value,positive}:{label:string;value:string;positive?:boolean}){return <div><span>{label}</span><strong className={positive?'positive':''}>{value}</strong></div>}
function Legend({color,label,value}:{color:string;label:string;value:string}){return <div className="legend-row"><i style={{background:color}}/><span>{label}</span><b>{value}</b></div>}

function PlanCard({plan,number,onChange,onCopy,onRemove}:{plan:PrepaymentPlan;number:number;onChange:(p:Partial<PrepaymentPlan>)=>void;onCopy:()=>void;onRemove:()=>void}){return <article className={`plan-card ${plan.enabled?'':'disabled'}`}><div className="plan-top"><div><label className="switch"><input type="checkbox" checked={plan.enabled} onChange={e=>onChange({enabled:e.target.checked})}/><span/></label><strong>План {number}</strong></div><div className="plan-actions"><button aria-label="Копировать план" onClick={onCopy}><Copy size={16}/></button><button aria-label="Удалить план" onClick={onRemove}><Trash2 size={16}/></button></div></div><div className="plan-fields"><NumberField label="Сумма" value={plan.amount} suffix="₽" onChange={v=>onChange({amount:v})} wide/><label className="field"><span>Периодичность</span><select value={plan.frequency} onChange={e=>onChange({frequency:e.target.value as Frequency})}><option value="once">Разовый</option><option value="monthly">Ежемесячный</option><option value="yearly">Ежегодный</option></select></label><label className="field"><span>Пересчёт</span><select value={plan.strategy} onChange={e=>onChange({strategy:e.target.value as Strategy})}><option value="term">Уменьшать срок</option><option value="payment">Уменьшать платёж</option></select></label><DateField label={plan.frequency==='once'?'Дата платежа':'Дата начала'} value={plan.startDate} onChange={v=>onChange({startDate:v})}/>{plan.frequency!=='once'&&<DateField label="Дата окончания (необязательно)" value={plan.endDate} onChange={v=>onChange({endDate:v})}/>}</div></article>}

function ComparisonTable({scenarios,results}:{scenarios:Scenario[];results:Map<string,ScenarioResult>}){return <div className="comparison-table"><table><thead><tr><th>Показатель</th>{scenarios.map(s=><th key={s.id}>{s.name}</th>)}</tr></thead><tbody><CompareRow label="Дата закрытия" values={scenarios.map(s=>dateFormat.format(results.get(s.id)!.payoffDate))}/><CompareRow label="Фактический срок" values={scenarios.map(s=>formatDuration(results.get(s.id)!.durationMonths))}/><CompareRow label="Проценты" values={scenarios.map(s=>money.format(results.get(s.id)!.totalInterest))}/><CompareRow label="Досрочно" values={scenarios.map(s=>money.format(results.get(s.id)!.totalExtra))}/><CompareRow label="Всего выплат" values={scenarios.map(s=>money.format(results.get(s.id)!.totalPaid))}/><CompareRow label="Максимум за месяц" values={scenarios.map(s=>money.format(results.get(s.id)!.maxMonthlyPayment))}/></tbody></table></div>}
function CompareRow({label,values}:{label:string;values:string[]}){return <tr><th>{label}</th>{values.map((v,i)=><td key={`${v}-${i}`}>{v}</td>)}</tr>}

function FragmentRow({row,endOfMonth,monthTotal}:{row:ScenarioResult['schedule'][number];endOfMonth:boolean;monthTotal:number}){return <><tr><td><strong>{dateFormat.format(new Date(`${row.date}T00:00:00Z`))}</strong><span className={`type-tag ${row.type}`}>{row.type==='regular'?'Обязательный':'Досрочный'}</span></td><td>{row.regularPayment?exactMoney.format(row.regularPayment):'—'}</td><td>{row.extraPayment?exactMoney.format(row.extraPayment):'—'}</td><td><b>{exactMoney.format(row.totalPayment)}</b></td><td>{row.interest?exactMoney.format(row.interest):'—'}</td><td>{exactMoney.format(row.regularPrincipal+row.extraPrincipal)}</td><td>{exactMoney.format(row.balance)}</td><td>{exactMoney.format(row.paymentAfter)}</td><td>{formatDuration(row.remainingMonths)}</td></tr>{endOfMonth&&<tr className="month-total"><td colSpan={3}>Итого за {new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(new Date(`${row.date.slice(0,7)}-01T00:00:00Z`))}</td><td>{exactMoney.format(monthTotal)}</td><td colSpan={5}/></tr>}</>}
function ScheduleYear({year,rows,defaultOpen}:{year:string;rows:ScenarioResult['schedule'];defaultOpen:boolean}){
  const [open,setOpen]=useState(defaultOpen)
  const monthTotals=useMemo(()=>{
    const totals=new Map<string,number>()
    for(const row of rows){const month=row.date.slice(0,7);totals.set(month,(totals.get(month)??0)+row.totalPayment)}
    return totals
  },[rows])
  return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)}><summary><span>{year} год</span><b>{rows.length} операций</b></summary>{open&&<div className="table-scroll"><table><thead><tr><th>Дата / тип</th><th>Обязательный</th><th>Досрочный</th><th>Общий платёж</th><th>Проценты</th><th>В тело</th><th>Остаток</th><th>Новый платёж</th><th>Осталось</th></tr></thead><tbody>{rows.map((row,rowIndex)=>{const next=rows[rowIndex+1];const month=row.date.slice(0,7);const endOfMonth=!next||next.date.slice(0,7)!==month;return <FragmentRow key={row.id} row={row} endOfMonth={endOfMonth} monthTotal={monthTotals.get(month)??0}/>})}</tbody></table></div>}</details>
}
function groupByYear(rows:ScenarioResult['schedule']){const map=new Map<string,ScenarioResult['schedule']>();for(const row of rows){const year=row.date.slice(0,4);map.set(year,[...(map.get(year)??[]),row])}return map}

export default App
