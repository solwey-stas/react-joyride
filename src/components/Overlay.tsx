import * as React from 'react';
import treeChanges from 'tree-changes';
import {AnimatePresence, motion} from 'framer-motion';

import {
  getClientRect,
  getDocumentHeight,
  getElement,
  getElementPosition,
  getScrollParent,
  hasCustomScrollParent,
  hasPosition,
} from '../modules/dom';
import { getBrowser, isLegacy, log } from '../modules/helpers';

import { LIFECYCLE } from '../literals';

import { Lifecycle, OverlayProps } from '../types';

interface State {
  isScrolling: boolean;
  mouseOverSpotlight: boolean;
  showSpotlight: boolean;
}

interface SpotlightStyles extends React.CSSProperties {
  height: number;
  left: number;
  top: number;
  width: number;
}

export default class JoyrideOverlay extends React.Component<OverlayProps, State> {
  isActive = false;
  resizeTimeout?: number;
  scrollTimeout?: number;
  scrollParent?: Document | Element;
  state = {
    isScrolling: false,
    mouseOverSpotlight: false,
    showSpotlight: true,
  };

  componentDidMount() {
    const { debug, disableScrolling, disableScrollParentFix = false, target } = this.props;
    const element = getElement(target);

    this.scrollParent = getScrollParent(element ?? document.body, disableScrollParentFix, true);
    this.isActive = true;

    if (process.env.NODE_ENV !== 'production') {
      if (!disableScrolling && hasCustomScrollParent(element, true)) {
        log({
          title: 'step has a custom scroll parent and can cause trouble with scrolling',
          data: [{ key: 'parent', value: this.scrollParent }],
          debug,
        });
      }
    }

    window.addEventListener('resize', this.handleResize);
  }

  componentDidUpdate(previousProps: OverlayProps) {
    const { disableScrollParentFix, lifecycle, spotlightClicks, target } = this.props;
    const { changed } = treeChanges(previousProps, this.props);

    if (changed('target') || changed('disableScrollParentFix')) {
      const element = getElement(target);

      this.scrollParent = getScrollParent(element ?? document.body, disableScrollParentFix, true);
    }

    if (changed('lifecycle', LIFECYCLE.TOOLTIP)) {
      this.scrollParent?.addEventListener('scroll', this.handleScroll, { passive: true });

      setTimeout(() => {
        const { isScrolling } = this.state;

        if (!isScrolling) {
          this.updateState({ showSpotlight: true });
        }
      }, 100);
    }

    if (changed('spotlightClicks') || changed('disableOverlay') || changed('lifecycle')) {
      if (spotlightClicks && lifecycle === LIFECYCLE.TOOLTIP) {
        window.addEventListener('mousemove', this.handleMouseMove, false);
      } else if (lifecycle !== LIFECYCLE.TOOLTIP) {
        window.removeEventListener('mousemove', this.handleMouseMove);
      }
    }
  }

  componentWillUnmount() {
    this.isActive = false;

    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('resize', this.handleResize);

    clearTimeout(this.resizeTimeout);
    clearTimeout(this.scrollTimeout);
    this.scrollParent?.removeEventListener('scroll', this.handleScroll);
  }

  hideSpotlight = () => {
    const { continuous, disableOverlay, lifecycle } = this.props;
    const hiddenLifecycles = [
      LIFECYCLE.INIT,
      LIFECYCLE.BEACON,
      LIFECYCLE.COMPLETE,
      LIFECYCLE.ERROR,
    ] as Lifecycle[];

    return (
      disableOverlay ||
      (continuous ? hiddenLifecycles.includes(lifecycle) : lifecycle !== LIFECYCLE.TOOLTIP)
    );
  };

  get overlayStyles() {
    const { mouseOverSpotlight } = this.state;
    const { disableOverlayClose, placement, styles } = this.props;

    let baseStyles = styles.overlay;

    if (isLegacy()) {
      baseStyles = placement === 'center' ? styles.overlayLegacyCenter : styles.overlayLegacy;
    }

    return {
      cursor: disableOverlayClose ? 'default' : 'pointer',
      height: getDocumentHeight(),
      pointerEvents: mouseOverSpotlight ? 'none' : 'auto',
      ...baseStyles,
    } as React.CSSProperties;
  }

  get spotlightStyles(): SpotlightStyles {
    const { showSpotlight } = this.state;
    const {
      disableScrollParentFix = false,
      spotlightClicks,
      spotlightPadding = 0,
      styles,
      target,
    } = this.props;
    const element = getElement(target);
    const elementRect = getClientRect(element);
    const isFixedTarget = hasPosition(element);
    const top = getElementPosition(element, spotlightPadding, disableScrollParentFix);

    return {
      ...(isLegacy() ? styles.spotlightLegacy : styles.spotlight),
      height: Math.round((elementRect?.height ?? 0) + spotlightPadding * 2),
      left: Math.round((elementRect?.left ?? 0) - spotlightPadding),
      pointerEvents: spotlightClicks ? 'none' : 'auto',
      position: isFixedTarget ? 'fixed' : 'absolute',
      top,
      width: Math.round((elementRect?.width ?? 0) + spotlightPadding * 2),
    } satisfies React.CSSProperties;
  }

  handleMouseMove = (event: MouseEvent) => {
    const { mouseOverSpotlight } = this.state;
    const { height, left, position, top, width } = this.spotlightStyles;

    const offsetY = position === 'fixed' ? event.clientY : event.pageY;
    const offsetX = position === 'fixed' ? event.clientX : event.pageX;
    const inSpotlightHeight = offsetY >= top && offsetY <= top + height;
    const inSpotlightWidth = offsetX >= left && offsetX <= left + width;
    const inSpotlight = inSpotlightWidth && inSpotlightHeight;

    if (inSpotlight !== mouseOverSpotlight) {
      this.updateState({ mouseOverSpotlight: inSpotlight });
    }
  };

  handleScroll = () => {
    const { target } = this.props;
    const element = getElement(target);

    if (this.scrollParent !== document || hasPosition(element, 'sticky')) {
      this.updateState({});
    }
  };

  handleResize = () => {
    clearTimeout(this.resizeTimeout);

    this.resizeTimeout = window.setTimeout(() => {
      if (!this.isActive) {
        return;
      }

      this.forceUpdate();
    }, 100);
  };

  updateState(state: Partial<State>) {
    if (!this.isActive) {
      return;
    }

    this.setState(previousState => ({ ...previousState, ...state }));
  }

  render() {
    const { showSpotlight } = this.state;
    const { onClickOverlay, placement, target } = this.props;
    const { hideSpotlight, overlayStyles, spotlightStyles } = this;

    let spotlight = placement !== 'center' && showSpotlight && (
      <motion.div
        key={target.toString()}
        className="react-joyride__spotlight"
        data-test-id="spotlight"
        style={spotlightStyles}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      />
    );

    return (
      <AnimatePresence>
        { !hideSpotlight() && (
          <motion.div
            className="react-joyride__overlay"
            data-test-id="overlay"
            onClick={onClickOverlay}
            role="presentation"
            style={overlayStyles}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AnimatePresence>
              {spotlight}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
}
