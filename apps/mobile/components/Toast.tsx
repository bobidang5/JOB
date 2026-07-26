import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, radius, timings } from '../theme';

/**
 * 底部深色胶囊 Toast（DESIGN-SPEC §5.8）：1.7s 自动消失，用于所有轻反馈。
 *
 * 连续触发时按原型的行为——重置计时器并换文案，而不是排队，
 * 因为界面上同时只可能有一条。
 */

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useState(() => new Animated.Value(0))[0];
  const translateY = useState(() => new Animated.Value(16))[0];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 16,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setMessage(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (next: string) => {
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);

      opacity.setValue(0);
      translateY.setValue(16);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();

      timer.current = setTimeout(hide, timings.toast);
    },
    [hide, opacity, translateY],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message !== null ? (
        <View style={styles.wrapper} pointerEvents="none">
          <Animated.View
            accessibilityLiveRegion="polite"
            testID="toast"
            style={[styles.pill, { opacity, transform: [{ translateY }] }]}
          >
            <Text style={styles.text}>{message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内使用');
  }
  return context;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 108,
    alignItems: 'center',
  },
  pill: {
    backgroundColor: colors.toast,
    borderRadius: radius.pill,
    paddingVertical: 11,
    paddingHorizontal: 18,
    maxWidth: 330,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
});
