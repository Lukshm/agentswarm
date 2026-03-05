'use client';

import { useState } from 'react';
import styles from './Counter.module.css';

const INCREMENTS = [1, 10, 100, 1000];

export default function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div className={styles.container}>
      <div className={styles.count}>{count}</div>

      <div className={styles.buttonRow}>
        {INCREMENTS.map((n) => (
          <button
            key={`add-${n}`}
            className={`${styles.btn} ${styles.add}`}
            onClick={() => setCount((c) => c + n)}
          >
            +{n}
          </button>
        ))}
      </div>

      <div className={styles.buttonRow}>
        {INCREMENTS.map((n) => (
          <button
            key={`sub-${n}`}
            className={`${styles.btn} ${styles.subtract}`}
            onClick={() => setCount((c) => c - n)}
          >
            -{n}
          </button>
        ))}
      </div>

      <button
        className={`${styles.btn} ${styles.reset}`}
        onClick={() => setCount(0)}
      >
        Reset
      </button>
    </div>
  );
}
