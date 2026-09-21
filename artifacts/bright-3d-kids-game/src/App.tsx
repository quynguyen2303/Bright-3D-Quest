import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Gamepad2,
  Heart,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Sprout,
  Star,
  Trophy,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type GameState = 'welcome' | 'running' | 'paused' | 'levelComplete' | 'gameOver' | 'won';
type Point = { id: string; x: number; y: number };
type Hazard = Point & { axis: 'x' | 'y'; range: number; speed: number; phase: number };
type Level = {
  name: string;
  subtitle: string;
  stars: Point[];
  hazards: Hazard[];
  portal: Point;
};

const LEVELS: Level[] = [
  {
    name: 'Sunbeam Meadow',
    subtitle: 'A gentle first garden',
    stars: [
      { id: 's1', x: 23, y: 28 },
      { id: 's2', x: 50, y: 62 },
      { id: 's3', x: 77, y: 34 },
    ],
    hazards: [
      { id: 'h1', x: 50, y: 37, axis: 'x', range: 11, speed: 1.1, phase: 0 },
    ],
    portal: { id: 'portal', x: 84, y: 73 },
  },
  {
    name: 'Breezy Berry Hill',
    subtitle: 'Watch the wandering puffballs',
    stars: [
      { id: 's1', x: 18, y: 65 },
      { id: 's2', x: 39, y: 25 },
      { id: 's3', x: 60, y: 72 },
      { id: 's4', x: 80, y: 30 },
    ],
    hazards: [
      { id: 'h1', x: 33, y: 43, axis: 'x', range: 16, speed: 1.25, phase: 0 },
      { id: 'h2', x: 65, y: 49, axis: 'y', range: 13, speed: 1.45, phase: 1.6 },
    ],
    portal: { id: 'portal', x: 86, y: 78 },
  },
  {
    name: 'Moonlit Sprout Run',
    subtitle: 'The big rainbow finale',
    stars: [
      { id: 's1', x: 17, y: 31 },
      { id: 's2', x: 35, y: 72 },
      { id: 's3', x: 53, y: 27 },
      { id: 's4', x: 71, y: 70 },
      { id: 's5', x: 84, y: 34 },
    ],
    hazards: [
      { id: 'h1', x: 29, y: 44, axis: 'y', range: 18, speed: 1.75, phase: .4 },
      { id: 'h2', x: 50, y: 53, axis: 'x', range: 17, speed: 1.55, phase: 2.1 },
      { id: 'h3', x: 72, y: 43, axis: 'y', range: 18, speed: 1.9, phase: 3.3 },
    ],
    portal: { id: 'portal', x: 88, y: 78 },
  },
];

const initialPlayer = { x: 11, y: 75 };

function getHazardPosition(hazard: Hazard, time: number) {
  const wave = Math.sin(time * hazard.speed + hazard.phase) * hazard.range;
  return {
    x: hazard.axis === 'x' ? hazard.x + wave : hazard.x,
    y: hazard.axis === 'y' ? hazard.y + wave : hazard.y,
  };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function Home() {
  const [gameState, setGameState] = useState<GameState>('welcome');
  const [levelIndex, setLevelIndex] = useState(0);
  const [player, setPlayer] = useState(initialPlayer);
  const [jumpHeight, setJumpHeight] = useState(0);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [collected, setCollected] = useState<string[]>([]);
  const [gameTime, setGameTime] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackKey, setFeedbackKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [bestScore, setBestScore] = useState(() => Number(localStorage.getItem('star-sprout-best') ?? 0));
  const playerRef = useRef(initialPlayer);
  const jumpRef = useRef({ height: 0, velocity: 0 });
  const keysRef = useRef<Record<string, boolean>>({});
  const gameStateRef = useRef<GameState>('welcome');
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const gameTimeRef = useRef(0);
  const levelRef = useRef(0);
  const collectedRef = useRef<string[]>([]);
  const livesRef = useRef(3);

  const level = LEVELS[levelIndex];
  const starCount = level.stars.length;
  const progress = Math.round((collected.length / starCount) * 100);
  const hazards = useMemo(
    () => level.hazards.map((hazard) => ({ hazard, position: getHazardPosition(hazard, gameTime) })),
    [level, gameTime],
  );

  const setGameMode = useCallback((next: GameState) => {
    gameStateRef.current = next;
    setGameState(next);
  }, []);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    setFeedbackKey((current) => current + 1);
  }, []);

  const resetLevel = useCallback((index: number) => {
    levelRef.current = index;
    playerRef.current = initialPlayer;
    jumpRef.current = { height: 0, velocity: 0 };
    collectedRef.current = [];
    setPlayer(initialPlayer);
    setJumpHeight(0);
    setCollected([]);
    setGameTime(0);
    gameTimeRef.current = 0;
  }, []);

  const startFresh = useCallback(() => {
    setLevelIndex(0);
    resetLevel(0);
    setLives(3);
    livesRef.current = 3;
    setScore(0);
    setShowHelp(false);
    setGameMode('running');
  }, [resetLevel, setGameMode]);

  const continueQuest = useCallback(() => {
    if (levelIndex >= LEVELS.length - 1) {
      setGameMode('won');
      return;
    }
    const nextLevel = levelIndex + 1;
    setLevelIndex(nextLevel);
    resetLevel(nextLevel);
    setGameMode('running');
  }, [levelIndex, resetLevel, setGameMode]);

  const beginHop = useCallback(() => {
    if (gameStateRef.current !== 'running' || jumpRef.current.height > 0) return;
    jumpRef.current.velocity = 72;
  }, []);

  const loseLife = useCallback(() => {
    const nextLives = livesRef.current - 1;
    livesRef.current = nextLives;
    setLives(nextLives);
    playerRef.current = initialPlayer;
    setPlayer(initialPlayer);
    jumpRef.current = { height: 0, velocity: 0 };
    setJumpHeight(0);
    if (nextLives <= 0) {
      setGameMode('gameOver');
      showFeedback('Try one more time!');
    } else {
      showFeedback('Boop! Keep exploring');
    }
  }, [setGameMode, showFeedback]);

  useEffect(() => {
    gameStateRef.current = gameState;
    levelRef.current = levelIndex;
    collectedRef.current = collected;
    livesRef.current = lives;
  }, [collected, gameState, levelIndex, lives]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' '].includes(key)) {
        event.preventDefault();
      }
      keysRef.current[key] = true;
      if (key === ' ' || key === 'spacebar') beginHop();
      if (key === 'p' && (gameStateRef.current === 'running' || gameStateRef.current === 'paused')) {
        const next = gameStateRef.current === 'running' ? 'paused' : 'running';
        gameStateRef.current = next;
        setGameState(next);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current[event.key.toLowerCase()] = false;
    };
    const handleBlur = () => {
      keysRef.current = {};
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [beginHop]);

  useEffect(() => {
    const animate = (time: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = time;
      const delta = Math.min((time - lastFrameRef.current) / 1000, .04);
      lastFrameRef.current = time;

      if (gameStateRef.current === 'running') {
        const speed = 30 + levelRef.current * 3;
        const keys = keysRef.current;
        const directionX = Number(keys.arrowright || keys.d) - Number(keys.arrowleft || keys.a);
        const directionY = Number(keys.arrowdown || keys.s) - Number(keys.arrowup || keys.w);
        const nextPlayer = {
          x: Math.max(9, Math.min(91, playerRef.current.x + directionX * speed * delta)),
          y: Math.max(14, Math.min(84, playerRef.current.y + directionY * speed * delta)),
        };
        if (directionX || directionY) {
          playerRef.current = nextPlayer;
          setPlayer(nextPlayer);
        }

        if (jumpRef.current.velocity || jumpRef.current.height > 0) {
          const nextHeight = jumpRef.current.height + jumpRef.current.velocity * delta;
          jumpRef.current.velocity -= 190 * delta;
          if (nextHeight <= 0) jumpRef.current = { height: 0, velocity: 0 };
          else jumpRef.current.height = nextHeight;
          setJumpHeight(jumpRef.current.height);
        }

        const currentLevel = LEVELS[levelRef.current];
        const nextTime = gameTimeRef.current + delta;
        gameTimeRef.current = nextTime;
        setGameTime(nextTime);
        const currentPlayer = playerRef.current;
        const jumped = jumpRef.current.height > 12;

        let hitHazard = false;
        currentLevel.hazards.forEach((hazard) => {
          const hazardPosition = getHazardPosition(hazard, nextTime);
          if (!hitHazard && !jumped && distance(currentPlayer, { ...hazard, ...hazardPosition }) < 7) {
            hitHazard = true;
            loseLife();
          }
        });

        currentLevel.stars.forEach((star) => {
          if (!collectedRef.current.includes(star.id) && distance(currentPlayer, star) < 7) {
            const nextCollected = [...collectedRef.current, star.id];
            collectedRef.current = nextCollected;
            setCollected(nextCollected);
            setScore((current) => current + 25);
            showFeedback('+25 star sparkle');
          }
        });

        const allStars = collectedRef.current.length === currentLevel.stars.length;
        if (allStars && distance(currentPlayer, currentLevel.portal) < 9) {
          setScore((current) => current + (levelRef.current + 1) * 50);
          setGameMode(levelRef.current === LEVELS.length - 1 ? 'won' : 'levelComplete');
          showFeedback('Portal unlocked!');
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [loseLife, setGameMode, showFeedback]);

  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem('star-sprout-best', String(score));
    }
  }, [bestScore, score]);

  const togglePause = () => {
    if (gameState === 'running') setGameMode('paused');
    else if (gameState === 'paused') setGameMode('running');
  };

  const startPointerMove = (key: string) => {
    keysRef.current[key] = true;
  };
  const stopPointerMove = (key: string) => {
    keysRef.current[key] = false;
  };

  const modal = showHelp ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="how-title">
        <div className="modal-badge"><Gamepad2 size={32} /></div>
        <h2 id="how-title">How to play</h2>
        <p>Guide Sprout around the island, gather every glowing star, then step through the rainbow portal.</p>
        <div className="how-to">
          <span className="key-cap">WASD</span>
          <span className="key-cap">ARROWS</span>
          <span className="key-cap">SPACE</span>
          <span>move · hop</span>
        </div>
        <div className="modal-actions">
          <button className="game-button teal" onClick={() => setShowHelp(false)} data-testid="button-close-how-to">Got it</button>
        </div>
      </div>
    </div>
  ) : gameState === 'welcome' ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
        <div className="modal-badge"><Sprout size={34} /></div>
        <h1 id="welcome-title">Star Sprout<br />Quest</h1>
        <p>A tiny explorer. Three floating gardens. One very sparkly adventure.</p>
        <div className="how-to">
          <span className="key-cap">WASD</span>
          <span className="key-cap">ARROWS</span>
          <span className="key-cap">SPACE</span>
          <span>move · hop</span>
        </div>
        <div className="modal-actions">
          <button className="game-button" onClick={startFresh} data-testid="button-start-quest">
            Start the quest <ChevronRight size={17} />
          </button>
          <button className="game-button secondary" onClick={() => setShowHelp(true)} data-testid="button-how-to">
            How to play
          </button>
        </div>
      </div>
    </div>
  ) : gameState === 'paused' ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div className="modal-badge"><Pause size={32} /></div>
        <h2 id="pause-title">Garden paused</h2>
        <p>Your sprouts are safe. Take a breath, then jump back in when you are ready.</p>
        <div className="modal-actions">
          <button className="game-button teal" onClick={togglePause} data-testid="button-resume-game"><Play size={17} /> Resume</button>
          <button className="game-button secondary" onClick={startFresh} data-testid="button-restart-paused"><RotateCcw size={17} /> Restart</button>
        </div>
      </div>
    </div>
  ) : gameState === 'levelComplete' ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="level-title">
        <div className="modal-badge"><Star size={34} fill="currentColor" /></div>
        <h2 id="level-title">Garden {levelIndex + 1} complete!</h2>
        <p>{level.subtitle}. Your star trail is getting brighter.</p>
        <div className="modal-actions">
          <button className="game-button" onClick={continueQuest} data-testid="button-next-garden">Next garden <ChevronRight size={17} /></button>
        </div>
      </div>
    </div>
  ) : gameState === 'gameOver' ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="over-title">
        <div className="modal-badge"><Heart size={34} fill="currentColor" /></div>
        <h2 id="over-title">A soft reset</h2>
        <p>The puffballs got you this time. Garden {levelIndex + 1} is ready whenever you are.</p>
        <div className="modal-actions">
          <button className="game-button" onClick={startFresh} data-testid="button-try-again">Try again <RotateCcw size={17} /></button>
        </div>
      </div>
    </div>
  ) : gameState === 'won' ? (
    <div className="modal-scrim">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="win-title">
        <div className="modal-badge"><Trophy size={34} /></div>
        <h2 id="win-title">Rainbow reached!</h2>
        <p>You collected the whole constellation and made it through all three gardens. What a quest.</p>
        <div className="modal-actions">
          <button className="game-button" onClick={startFresh} data-testid="button-play-again">Play again <RotateCcw size={17} /></button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <main className="quest-shell">
      <header className="quest-header">
        <div className="brand-lockup">
          <div className="brand-mark"><Sprout size={26} /></div>
          <div>
            <h1 className="brand-title">Star Sprout Quest</h1>
            <p className="brand-subtitle">A little garden adventure</p>
          </div>
        </div>
        <div className="quest-header-actions">
          <div className="best-score" data-testid="text-best-score"><Trophy size={15} /> Best {bestScore}</div>
          <button className="icon-button" onClick={() => setShowHelp(true)} aria-label="How to play" data-testid="button-open-help"><HelpCircle size={19} /></button>
          <button className="icon-button" onClick={togglePause} aria-label={gameState === 'paused' ? 'Resume game' : 'Pause game'} data-testid="button-pause"><Pause size={18} /></button>
          <button className="icon-button" onClick={startFresh} aria-label="Restart quest" data-testid="button-restart"><RotateCcw size={17} /></button>
        </div>
      </header>

      <section className="game-layout" aria-label="Star Sprout Quest game">
        <div className="game-card">
          <div className="hud-bar">
            <div className="level-ribbon">
              <div className="level-number" data-testid="text-level-number">{levelIndex + 1}</div>
              <div>
                <p className="eyebrow">Current garden</p>
                <p className="level-name" data-testid="text-level-name">{level.name}</p>
              </div>
            </div>
            <div className="stat-cluster">
              <div className="stat-pill" data-testid="text-score"><strong>{score}</strong><span>score</span></div>
              <div className="stat-pill" data-testid="text-stars"><strong>{collected.length}/{starCount}</strong><span>stars</span></div>
              <div className="stat-pill" data-testid="text-lives"><div className="life-dots">{[0, 1, 2].map((life) => <i className={`life-dot ${life >= lives ? 'off' : ''}`} key={life} />)}</div><span>lives</span></div>
            </div>
          </div>

          <div className="arena-wrap" data-testid="game-arena">
            <div className="sky-orb" />
            <div className="game-world">
              <div className="island" />
              <span className="sparkle one" />
              <span className="sparkle two" />
              <span className="sparkle three" />
              {level.stars.map((star) => collected.includes(star.id) ? null : (
                <div className="world-item star-item" style={{ left: `${star.x}%`, top: `${star.y}%` }} key={star.id} data-testid={`star-${star.id}`}>
                  <Star className="star-inner" size={27} fill="currentColor" />
                </div>
              ))}
              {hazards.map(({ hazard, position }) => (
                <div className="world-item hazard" style={{ left: `${position.x}%`, top: `${position.y}%` }} key={hazard.id} data-testid={`hazard-${hazard.id}`} aria-label="wandering puffball" />
              ))}
              <div className="world-item portal" style={{ left: `${level.portal.x}%`, top: `${level.portal.y}%` }} data-testid="rainbow-portal" aria-label="rainbow portal" />
              <div
                className="world-item player"
                style={{ left: `${player.x}%`, top: `${player.y}%`, transform: `translate(-50%, -50%) translateY(${-jumpHeight}px)` }}
                data-testid="player-sprout"
                aria-label="Sprout explorer"
              >
                <div className="player-shadow" />
                <div className="player-body"><div className="player-face"><div className="player-cap" /></div></div>
              </div>
            </div>
            {feedback && <div className="toast-feedback" key={feedbackKey} data-testid="text-feedback">{feedback}</div>}

            <div className="control-dock" aria-label="Movement controls">
              <button className="control-key up" onPointerDown={() => startPointerMove('arrowup')} onPointerUp={() => stopPointerMove('arrowup')} onPointerLeave={() => stopPointerMove('arrowup')} data-testid="button-move-up" aria-label="Move up"><ArrowUp size={18} /></button>
              <button className="control-key left" onPointerDown={() => startPointerMove('arrowleft')} onPointerUp={() => stopPointerMove('arrowleft')} onPointerLeave={() => stopPointerMove('arrowleft')} data-testid="button-move-left" aria-label="Move left"><ArrowLeft size={18} /></button>
              <button className="control-key down" onPointerDown={() => startPointerMove('arrowdown')} onPointerUp={() => stopPointerMove('arrowdown')} onPointerLeave={() => stopPointerMove('arrowdown')} data-testid="button-move-down" aria-label="Move down"><ArrowDown size={18} /></button>
              <button className="control-key right" onPointerDown={() => startPointerMove('arrowright')} onPointerUp={() => stopPointerMove('arrowright')} onPointerLeave={() => stopPointerMove('arrowright')} data-testid="button-move-right" aria-label="Move right"><ArrowRight size={18} /></button>
            </div>
            <button className="hop-button" onPointerDown={beginHop} data-testid="button-hop" aria-label="Hop">Hop</button>
            {modal}
          </div>
        </div>

        <aside className="side-panel">
          <div className="info-card goal-card">
            <span className="goal-kicker">Garden goal</span>
            <p>Collect all the stars, then find the rainbow portal.</p>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
          </div>
          <div className="info-card desktop-only">
            <h2>Little explorer tips</h2>
            <div className="tip-row"><span className="tip-icon"><Star size={16} fill="currentColor" /></span><span>Stars add 25 points each.</span></div>
            <div className="tip-row"><span className="tip-icon"><ArrowUp size={16} /></span><span>Hop over puffballs to stay safe.</span></div>
            <div className="tip-row"><span className="tip-icon"><Trophy size={16} /></span><span>Best score is saved on this device.</span></div>
          </div>
        </aside>
      </section>
      <p className="footer-note">Garden {levelIndex + 1} of 3 · {level.subtitle} · <span>Press P to pause</span></p>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
