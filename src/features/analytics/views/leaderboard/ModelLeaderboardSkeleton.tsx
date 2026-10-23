import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/Skeleton';
import { LEADERBOARD_METRICS } from './modelLeaderboardModel';
import styles from './ModelLeaderboard.module.scss';

const STEP_CLASS = { 1: styles.stepFirst, 2: styles.stepSecond, 3: styles.stepThird } as const;

/**
 * One podium slot. Each bar takes the exact line box of the text it stands in for (name 16,
 * value 38 or 46 for first place plus its 2px gap, subline 18), so the loaded card lands at the same height.
 */
function PodSkeleton({ rank }: { rank: 1 | 2 | 3 }) {
  const first = rank === 1;
  const frame = first ? 96 : 80;
  return (
    <li className={styles.pod}>
      <div className={styles.skeletonLine} style={{ height: 16 }}>
        <Skeleton width={first ? 130 : 110} height={12} rounded={6} />
      </div>
      <div className={styles.skeletonLine} style={{ height: first ? 46 : 38, marginTop: 2 }}>
        <Skeleton width={first ? 84 : 60} height={first ? 28 : 22} rounded={6} />
      </div>
      <div className={styles.skeletonLine + ' ' + styles.sub} style={{ height: 18 }}>
        <Skeleton width={80} height={11} rounded={6} />
      </div>
      <Skeleton width={frame} height={frame} rounded={16} />
      <span className={styles.step + ' ' + STEP_CLASS[rank]} />
    </li>
  );
}

/**
 * First-load placeholder with the same chip, card grid, and frame sizes as the loaded page,
 * so swapping in the real awards does not move anything.
 */
export function ModelLeaderboardSkeleton() {
  const { t } = useTranslation();
  return (
    <div className={styles.content} role="status" aria-busy="true">
      <span className={styles.srOnly}>{t('common.loading')}</span>
      <div className={styles.toolbar} aria-hidden="true">
        <Skeleton width={240} height={34} rounded={8} />
      </div>
      <div className={styles.awards} aria-hidden="true">
        {LEADERBOARD_METRICS.map((metric) => (
          <div key={metric} className={'card ' + styles.award}>
            <div className={styles.awardHead}>
              <div
                className={styles.skeletonLine + ' ' + styles.skeletonStart}
                style={{ height: 22 }}
              >
                <Skeleton width="55%" height={16} rounded={6} />
              </div>
              <div
                className={styles.skeletonLine + ' ' + styles.skeletonStart}
                style={{ height: 21 }}
              >
                <Skeleton width="85%" height={11} rounded={6} />
              </div>
            </div>
            <ol className={styles.podium}>
              <PodSkeleton rank={2} />
              <PodSkeleton rank={1} />
              <PodSkeleton rank={3} />
            </ol>
            <div className={styles.runners}>
              <div
                className={styles.skeletonLine + ' ' + styles.skeletonStart}
                style={{ height: 20 }}
              >
                <Skeleton width={80} height={11} rounded={6} />
              </div>
              <ol className={styles.runnerList + ' ' + styles.skeletonRunnerRows}>
                {[4, 5, 6].map((rank) => (
                  <li key={rank} className={styles.runner}>
                    <Skeleton width="100%" height={14} rounded={6} />
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
