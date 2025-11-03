// 高度なアクセシビリティユーティリティ
import React, { useEffect, useRef, useState } from 'react';

// WCAG 2.1準拠のコントラスト比計算
export const calculateContrastRatio = (color1, color2) => {
  const getLuminance = (hexColor) => {
    // HEXからRGBに変換
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;

    // 相対輝度計算
    const [rs, gs, bs] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const lum1 = getLuminance(color1);
  const lum2 = getLuminance(color2);

  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);

  return (brightest + 0.05) / (darkest + 0.05);
};

// 色覚異常シミュレーション
export const simulateColorBlindness = (color, type = 'protanopia') => {
  const colorMatrix = {
    // 赤緑色覚異常（プロタノピア）
    protanopia: [
      0.567, 0.433, 0, 0, 0,
      0.558, 0.442, 0, 0, 0,
      0, 0.242, 0.758, 0, 0,
      0, 0, 0, 1, 0
    ],
    // 赤緑色覚異常（デュータノピア）
    deuteranopia: [
      0.625, 0.375, 0, 0, 0,
      0.7, 0.3, 0, 0, 0,
      0, 0.3, 0.7, 0, 0,
      0, 0, 0, 1, 0
    ],
    // 青黄色覚異常（トリタノピア）
    tritanopia: [
      0.95, 0.05, 0, 0, 0,
      0, 0.433, 0.567, 0, 0,
      0, 0.475, 0.525, 0, 0,
      0, 0, 0, 1, 0
    ]
  };

  const matrix = colorMatrix[type] || colorMatrix.protanopia;

  // 簡易的な色変換（実際の実装ではより詳細な計算が必要）
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // マトリックス変換の簡易版
  const newR = Math.round(r * matrix[0] + g * matrix[1] + b * matrix[2]);
  const newG = Math.round(r * matrix[5] + g * matrix[6] + b * matrix[7]);
  const newB = Math.round(r * matrix[10] + g * matrix[11] + b * matrix[12]);

  return `#${Math.max(0, Math.min(255, newR)).toString(16).padStart(2, '0')}${Math.max(0, Math.min(255, newG)).toString(16).padStart(2, '0')}${Math.max(0, Math.min(255, newB)).toString(16).padStart(2, '0')}`;
};

// アクセシビリティヘルパー関数
export class AccessibilityHelper {
  // コントラストチェック
  static checkContrast(foreground, background) {
    const ratio = calculateContrastRatio(foreground, background);
    return {
      ratio: Math.round(ratio * 100) / 100,
      AA: ratio >= 4.5, // 通常テキスト
      AAA: ratio >= 7,  // 大きなテキスト
      AALarge: ratio >= 3, // 大きなテキスト
      AAALarge: ratio >= 4.5 // 大きなテキスト
    };
  }

  // 色覚異常対応カラーパレットの生成
  static generateColorBlindPalette(colors) {
    const palette = {};

    for (const [name, color] of Object.entries(colors)) {
      palette[name] = color;
      palette[`${name}_protan`] = simulateColorBlindness(color, 'protanopia');
      palette[`${name}_deutan`] = simulateColorBlindness(color, 'deuteranopia');
      palette[`${name}_tritan`] = simulateColorBlindness(color, 'tritanopia');
    }

    return palette;
  }

  // ARIA属性の自動生成
  static generateAriaAttributes(props) {
    const aria = {};

    if (props.label) aria['aria-label'] = props.label;
    if (props.description) aria['aria-describedby'] = props.description;
    if (props.expanded !== undefined) aria['aria-expanded'] = props.expanded;
    if (props.selected !== undefined) aria['aria-selected'] = props.selected;
    if (props.disabled !== undefined) aria['aria-disabled'] = props.disabled;
    if (props.required !== undefined) aria['aria-required'] = props.required;
    if (props.invalid !== undefined) aria['aria-invalid'] = props.invalid;
    if (props.busy !== undefined) aria['aria-busy'] = props.busy;
    if (props.live !== undefined) aria['aria-live'] = props.live;
    if (props.atomic !== undefined) aria['aria-atomic'] = props.atomic;
    if (props.relevant !== undefined) aria['aria-relevant'] = props.relevant;

    // 役割ベースの属性
    if (props.role) {
      aria['role'] = props.role;
      switch (props.role) {
        case 'button':
          if (props.pressed !== undefined) aria['aria-pressed'] = props.pressed;
          break;
        case 'checkbox':
        case 'radio':
          if (props.checked !== undefined) aria['aria-checked'] = props.checked;
          break;
        case 'menuitem':
          if (props.hasPopup !== undefined) aria['aria-haspopup'] = props.hasPopup;
          break;
        case 'progressbar':
          if (props.value !== undefined) aria['aria-valuenow'] = props.value;
          if (props.min !== undefined) aria['aria-valuemin'] = props.min;
          if (props.max !== undefined) aria['aria-valuemax'] = props.max;
          break;
        case 'slider':
          if (props.value !== undefined) aria['aria-valuenow'] = props.value;
          if (props.min !== undefined) aria['aria-valuemin'] = props.min;
          if (props.max !== undefined) aria['aria-valuemax'] = props.max;
          break;
        case 'listbox':
        case 'combobox':
          if (props.activeDescendant !== undefined) aria['aria-activedescendant'] = props.activeDescendant;
          break;
      }
    }

    return aria;
  }

  // キーボードナビゲーションの支援
  static handleKeyboardNavigation(event, handlers) {
    const { key } = event;

    switch (key) {
      case 'Enter':
      case ' ':
        if (handlers.onActivate) {
          event.preventDefault();
          handlers.onActivate();
        }
        break;
      case 'Escape':
        if (handlers.onEscape) {
          event.preventDefault();
          handlers.onEscape();
        }
        break;
      case 'ArrowUp':
        if (handlers.onArrowUp) {
          event.preventDefault();
          handlers.onArrowUp();
        }
        break;
      case 'ArrowDown':
        if (handlers.onArrowDown) {
          event.preventDefault();
          handlers.onArrowDown();
        }
        break;
      case 'ArrowLeft':
        if (handlers.onArrowLeft) {
          event.preventDefault();
          handlers.onArrowLeft();
        }
        break;
      case 'ArrowRight':
        if (handlers.onArrowRight) {
          event.preventDefault();
          handlers.onArrowRight();
        }
        break;
      case 'Home':
        if (handlers.onHome) {
          event.preventDefault();
          handlers.onHome();
        }
        break;
      case 'End':
        if (handlers.onEnd) {
          event.preventDefault();
          handlers.onEnd();
        }
        break;
      case 'Tab':
        if (handlers.onTab) {
          handlers.onTab(event.shiftKey);
        }
        break;
    }
  }
}

// フォーカス管理フック
export const useFocusManagement = (options = {}) => {
  const {
    autoFocus = false,
    trapFocus = false,
    restoreFocus = true,
    focusSelector = null
  } = options;

  const containerRef = useRef(null);
  const previousFocusRef = useRef(null);

  // 自動フォーカス
  useEffect(() => {
    if (autoFocus && containerRef.current) {
      previousFocusRef.current = document.activeElement;

      if (focusSelector) {
        const target = containerRef.current.querySelector(focusSelector);
        if (target) target.focus();
      } else {
        containerRef.current.focus();
      }
    }
  }, [autoFocus, focusSelector]);

  // フォーカストラップ
  useEffect(() => {
    if (!trapFocus || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (event) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);

    return () => {
      container.removeEventListener('keydown', handleTabKey);

      // フォーカス復元
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [trapFocus, restoreFocus]);

  return containerRef;
};

// スクリーンリーダー対応フック
export const useScreenReader = () => {
  const [announcements, setAnnouncements] = useState([]);
  const announcementTimeoutRef = useRef(null);

  // アナウンスメントの追加
  const announce = (message, priority = 'polite') => {
    const id = Date.now() + Math.random();
    const announcement = {
      id,
      message,
      priority,
      timestamp: Date.now()
    };

    setAnnouncements(prev => [...prev, announcement]);

    // 自動クリーンアップ
    if (announcementTimeoutRef.current) {
      clearTimeout(announcementTimeoutRef.current);
    }

    announcementTimeoutRef.current = setTimeout(() => {
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    }, 10000);

    return id;
  };

  // アナウンスメントの削除
  const removeAnnouncement = (id) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  // ライブリージョン要素の取得
  const getLiveRegion = (priority = 'polite') => {
    return (
      <div
        aria-live={priority}
        aria-atomic="true"
        className="sr-only"
        style={{
          position: 'absolute',
          left: '-10000px',
          width: '1px',
          height: '1px',
          overflow: 'hidden'
        }}
      >
        {announcements
          .filter(a => a.priority === priority)
          .map(a => (
            <div key={a.id}>{a.message}</div>
          ))
        }
      </div>
    );
  };

  return {
    announce,
    removeAnnouncement,
    getLiveRegion,
    announcements: announcements.length
  };
};

// 音声ガイドフック（オプション）
export const useVoiceGuidance = (enabled = false) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const speechSynthesisRef = useRef(null);

  // 音声ガイドの有効化/無効化
  const toggleVoiceGuidance = () => {
    setIsEnabled(prev => !prev);
  };

  // テキスト読み上げ
  const speak = (text, options = {}) => {
    if (!isEnabled || !window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || 'ja';
    utterance.rate = options.rate || 1;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 0.8;

    if (options.onStart) utterance.onstart = options.onStart;
    if (options.onEnd) utterance.onend = options.onEnd;
    if (options.onError) utterance.onerror = options.onError;

    window.speechSynthesis.speak(utterance);
  };

  // 利用可能な音声リストの取得
  const getAvailableVoices = () => {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  };

  // 音声の停止
  const stopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  return {
    isEnabled,
    toggleVoiceGuidance,
    speak,
    stopSpeaking,
    getAvailableVoices
  };
};

// 高コントラストモード検出・対応フック
export const useHighContrast = () => {
  const [isHighContrast, setIsHighContrast] = useState(false);

  useEffect(() => {
    // 高コントラストモードの検出
    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    setIsHighContrast(mediaQuery.matches);

    const handleChange = (e) => {
      setIsHighContrast(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return {
    isHighContrast,
    // 高コントラスト用のスタイル調整
    getHighContrastStyles: (baseStyles) => {
      if (!isHighContrast) return baseStyles;

      return {
        ...baseStyles,
        border: '2px solid currentColor',
        outline: '2px solid currentColor',
        outlineOffset: '2px'
      };
    }
  };
};

// モーション軽減フック
export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return {
    prefersReducedMotion,
    // モーション軽減用のスタイル調整
    getMotionReducedStyles: (baseStyles) => {
      if (!prefersReducedMotion) return baseStyles;

      return {
        ...baseStyles,
        transition: 'none',
        animation: 'none',
        transform: 'none'
      };
    }
  };
};

// フォントサイズ調整フック
export const useFontScaling = () => {
  const [fontScale, setFontScale] = useState(1);

  useEffect(() => {
    // ブラウザのフォントサイズ設定を検出
    const computedStyle = window.getComputedStyle(document.documentElement);
    const browserFontSize = parseFloat(computedStyle.fontSize);
    const baseFontSize = 16; // 通常のベースサイズ
    setFontScale(browserFontSize / baseFontSize);
  }, []);

  return {
    fontScale,
    // スケーリングされたスタイル取得
    getScaledStyles: (baseStyles) => {
      return {
        ...baseStyles,
        fontSize: typeof baseStyles.fontSize === 'number'
          ? `${baseStyles.fontSize * fontScale}px`
          : baseStyles.fontSize,
        lineHeight: typeof baseStyles.lineHeight === 'number'
          ? baseStyles.lineHeight * fontScale
          : baseStyles.lineHeight
      };
    }
  };
};

// 包括的なアクセシビリティプロバイダーコンポーネント
export const AccessibilityProvider = ({ children }) => {
  const focusManagement = useFocusManagement();
  const screenReader = useScreenReader();
  const highContrast = useHighContrast();
  const reducedMotion = useReducedMotion();
  const fontScaling = useFontScaling();

  const contextValue = {
    focusManagement,
    screenReader,
    highContrast,
    reducedMotion,
    fontScaling,
    announce: screenReader.announce,
    isHighContrast: highContrast.isHighContrast,
    prefersReducedMotion: reducedMotion.prefersReducedMotion,
    fontScale: fontScaling.fontScale
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
      {screenReader.getLiveRegion('polite')}
      {screenReader.getLiveRegion('assertive')}
    </AccessibilityContext.Provider>
  );
};

// アクセシビリティコンテキスト
const AccessibilityContext = React.createContext();

// アクセシビリティ対応のボタンコンポーネント
export const AccessibleButton = React.forwardRef((props, ref) => {
  const {
    children,
    onClick,
    disabled,
    ariaLabel,
    ariaDescribedBy,
    variant = 'primary',
    size = 'medium',
    ...rest
  } = props;

  const handleKeyDown = (event) => {
    AccessibilityHelper.handleKeyboardNavigation(event, {
      onActivate: onClick
    });
  };

  const ariaAttributes = AccessibilityHelper.generateAriaAttributes({
    label: ariaLabel,
    description: ariaDescribedBy,
    disabled,
    role: 'button'
  });

  return (
    <button
      ref={ref}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={`accessible-button accessible-button--${variant} accessible-button--${size}`}
      {...ariaAttributes}
      {...rest}
    >
      {children}
    </button>
  );
});

// アクセシビリティ対応の入力フィールドコンポーネント
export const AccessibleInput = React.forwardRef((props, ref) => {
  const {
    label,
    error,
    required,
    ariaDescribedBy,
    ariaLabelledBy,
    ...rest
  } = props;

  const inputId = React.useId();
  const errorId = React.useId();
  const descriptionId = React.useId();

  const ariaAttributes = AccessibilityHelper.generateAriaAttributes({
    label: ariaLabelledBy ? undefined : label,
    description: [ariaDescribedBy, error ? errorId : null, descriptionId].filter(Boolean).join(' ') || undefined,
    required,
    invalid: !!error,
    labelledby: ariaLabelledBy,
    describedby: [ariaDescribedBy, error ? errorId : null, descriptionId].filter(Boolean).join(' ') || undefined
  });

  return (
    <div className="accessible-input-container">
      {label && (
        <label htmlFor={inputId} className="accessible-input-label">
          {label}
          {required && <span className="accessible-input-required" aria-label="必須">*</span>}
        </label>
      )}

      <input
        ref={ref}
        id={inputId}
        className={`accessible-input ${error ? 'accessible-input--error' : ''}`}
        aria-required={required}
        {...ariaAttributes}
        {...rest}
      />

      {error && (
        <div id={errorId} className="accessible-input-error" role="alert">
          {error}
        </div>
      )}

      {rest.description && (
        <div id={descriptionId} className="accessible-input-description">
          {rest.description}
        </div>
      )}
    </div>
  );
});

export default AccessibilityHelper;
