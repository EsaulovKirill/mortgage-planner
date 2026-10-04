import { describe, expect, it } from 'vitest'
import { addMonthsAnchored, calculateScenario, yearFractionActualActual, type LoanTerms, type PrepaymentPlan } from './calculator'

const terms:LoanTerms={propertyPrice:12_000_000,downPayment:3_000_000,annualRate:12.5,years:20,issueDate:'2026-10-04',firstPaymentDate:'2026-11-04'}
const plan=(patch:Partial<PrepaymentPlan>):PrepaymentPlan=>({id:'plan',amount:50_000,frequency:'monthly',strategy:'term',startDate:'2026-11-04',endDate:'',enabled:true,...patch})

describe('calendar rules',()=>{
  it('uses the last day in a short month and returns to the anchor day',()=>{
    const first=new Date(Date.UTC(2027,0,31))
    expect(addMonthsAnchored(first,1).toISOString().slice(0,10)).toBe('2027-02-28')
    expect(addMonthsAnchored(first,2).toISOString().slice(0,10)).toBe('2027-03-31')
  })
  it('uses 366 days in a leap year',()=>{
    const from=new Date(Date.UTC(2028,1,28))
    const to=new Date(Date.UTC(2028,1,29))
    expect(yearFractionActualActual(from,to)).toBeCloseTo(1/366,12)
  })
})

describe('mortgage scenarios',()=>{
  it('builds exactly 240 regular payments for 20 years',()=>{
    const result=calculateScenario(terms)
    expect(result.schedule).toHaveLength(240)
    expect(result.payoffDate.toISOString().slice(0,10)).toBe('2046-10-04')
    expect(result.regularPrincipal).toBeCloseTo(9_000_000,2)
  })
  it('monthly extra payments reduce the term and never overpay principal',()=>{
    const result=calculateScenario(terms,[plan({})])
    expect(result.payoffDate.getTime()).toBeLessThan(calculateScenario(terms).payoffDate.getTime())
    expect(result.regularPrincipal+result.extraPrincipal).toBeCloseTo(9_000_000,2)
    expect(result.schedule.at(-1)?.balance).toBe(0)
  })
  it('payment reduction preserves the original closing date',()=>{
    const baseline=calculateScenario(terms)
    const result=calculateScenario(terms,[plan({frequency:'once',strategy:'payment',amount:1_000_000,startDate:'2027-03-15'})])
    expect(result.payoffDate.toISOString().slice(0,10)).toBe(baseline.payoffDate.toISOString().slice(0,10))
    expect(result.currentPayment).toBeLessThan(result.monthlyPayment)
  })
  it('caps a closing extra payment at the remaining principal',()=>{
    const result=calculateScenario(terms,[plan({frequency:'once',amount:99_000_000,startDate:'2026-10-05'})])
    expect(result.extraPrincipal).toBe(9_000_000)
    expect(result.payoffDate.toISOString().slice(0,10)).toBe('2026-10-05')
  })
  it('runs the regular payment before an extra payment on the same day',()=>{
    const result=calculateScenario(terms,[plan({frequency:'once',startDate:'2026-11-04'})])
    expect(result.schedule[0].type).toBe('regular')
    expect(result.schedule[1].type).toBe('prepayment')
  })
})
