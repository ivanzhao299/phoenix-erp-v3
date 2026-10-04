import { redirect } from 'next/navigation';

/**
 * Legacy receiving route.
 *
 * Inventory receipt confirmation is owned by the store replenishment/WMS
 * lifecycle. Keep this URL as a compatibility redirect so bookmarks do not
 * reopen the retired Generic CRUD editor.
 */
export default function StoreReceivingRedirect() {
  redirect('/store/replenish');
}
