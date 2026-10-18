/** Dedicated isolated-fixture /24s in the reserved benchmarking range only. */
function range(value){
  if(typeof value!=='string'||!/^\d+\.\d+\.\d+\.\d+\/(?:[0-9]|[12][0-9]|3[0-2])$/.test(value))throw Error('OWNED_SUBNET_INVENTORY_INVALID');
  const [address,prefix]=value.split('/'),octets=address.split('.').map(Number);if(octets.some(n=>!Number.isInteger(n)||n<0||n>255))throw Error('OWNED_SUBNET_INVENTORY_INVALID');
  const size=2**(32-Number(prefix)),number=octets.reduce((n,octet)=>n*256+octet,0),start=Math.floor(number/size)*size;return [start,start+size-1];
}
export function selectOwnedComposeSubnet(existing,offset=0){
  if(!Array.isArray(existing)||existing.length>2048||!Number.isSafeInteger(offset)||offset<0||offset>511)throw Error('OWNED_SUBNET_INVENTORY_INVALID');
  const occupied=existing.map(range);
  for(let n=0;n<512;n++){
    const candidate=(offset+n)%512,subnet=`198.${18+Math.floor(candidate/256)}.${candidate%256}.0/24`,[start,end]=range(subnet);
    if(!occupied.some(([left,right])=>start<=right&&left<=end))return subnet;
  }
  throw Error('OWNED_SUBNET_NO_NONOVERLAPPING_RANGE');
}
