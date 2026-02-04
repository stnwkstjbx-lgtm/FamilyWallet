import { useState, useEffect } from 'react';
import { onSnapshot } from 'firebase/firestore';

export function useFirestoreSubscription(queryRef, options = {}) {
  const { enabled = true, transform } = options;
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled || !queryRef) {
      setData([]);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(queryRef, (snapshot) => {
      const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setData(transform ? transform(items) : items);
      setLoading(false);
    }, (error) => {
      console.error('Firestore subscription error:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [enabled]); // queryRef is intentionally excluded to avoid infinite re-subscriptions

  return { data, loading };
}
