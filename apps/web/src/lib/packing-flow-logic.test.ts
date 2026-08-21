import { describe, expect, it } from 'vitest';
import { addPackingItem, canAddPacking, packedByGrade, remainingByGrade } from './packing-flow-logic';
const item = (grade='A', specId='S', boxes=1, eggs=30) => ({ grade, specId, spec:specId, boxes, eggs });
describe('packaging page flow logic', () => {
  it('aggregates local packed eggs',()=>expect(packedByGrade([item('A'),item('A','L',2,60),item('B','S',1,20)])).toEqual({A:90,B:20}));
  it('computes remaining and clamps at zero',()=>expect(remainingByGrade(['A','B','C'],{A:50,B:10},[item('A','S',2,60)])).toEqual({A:0,B:10,C:0}));
  it('adds a new grade/spec row',()=>expect(addPackingItem([],item())).toEqual([item()]));
  it('merges the same grade/spec',()=>expect(addPackingItem([item()],item('A','S',2,60))).toEqual([item('A','S',3,90)]));
  it('does not merge different specs',()=>expect(addPackingItem([item()],item('A','L',2,60))).toHaveLength(2));
  it('rejects nonpositive items',()=>expect(addPackingItem([item()],item('B','S',0,0))).toEqual([item()]));
  it.each([
    [{grade:'A',specQty:30,boxes:1,available:30},true], [{grade:'A',specQty:30,boxes:2,available:30},false],
    [{grade:null,specQty:30,boxes:1,available:30},false], [{grade:'A',specQty:0,boxes:1,available:30},false],
    [{grade:'A',specQty:30,boxes:0,available:30},false],
  ])('validates add %#',(input,expected)=>expect(canAddPacking(input)).toBe(expected));
});
