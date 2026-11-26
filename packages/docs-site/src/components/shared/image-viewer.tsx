import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { commonMessages } from '../../i18n/messages';
import type { CommonSiteMessages } from '../../i18n/messages';
import { Icon } from './icon';

export type ImageViewerMessages = Pick<CommonSiteMessages,
  | 'imageViewer' | 'imageControls'
  | 'closeImageViewer' | 'closeImageViewerHint'
  | 'previousImage' | 'previousImageHint' | 'nextImage' | 'nextImageHint'
  | 'zoomOut' | 'zoomOutHint' | 'zoomIn' | 'zoomInHint'
  | 'originalImageSize' | 'originalImageSizeHint'
  | 'fitImageToScreen' | 'fitImageToScreenHint'
>;

export interface ImageViewerImage {
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
}

export interface ImageViewerProps {
  messages?: ImageViewerMessages;
  images: readonly ImageViewerImage[];
  initialIndex: number;
  returnFocusTo?: () => HTMLElement | undefined;
  onClose: () => void;
}

const getImageDimensions = (
  image: ImageViewerImage,
  viewport: { width: number; height: number },
) => ({
  width: image.width > 0 ? image.width : Math.max(1, viewport.width - 64),
  height: image.height > 0 ? image.height : Math.max(1, viewport.height - 148),
});

const fitScaleFor = (
  image: ImageViewerImage,
  viewport: { width: number; height: number },
) => {
  const dimensions = getImageDimensions(image, viewport);

  return Math.min(
    Math.max(1, viewport.width - 64) / dimensions.width,
    Math.max(1, viewport.height - 148) / dimensions.height,
    1,
  );
};

const isSameScale = (left: number, right: number) =>
  Math.abs(left - right) < 0.005;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const getStageSize = (
  stage: HTMLDivElement | null,
  viewport: { width: number; height: number },
) => ({
  width:
    stage !== null && stage.clientWidth > 0
      ? stage.clientWidth
      : viewport.width - 64,
  height:
    stage !== null && stage.clientHeight > 0
      ? stage.clientHeight
      : viewport.height,
});

export function ImageViewer({
  messages: t = commonMessages.en,
  images,
  initialIndex,
  returnFocusTo,
  onClose,
}: ImageViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [scale, setScale] = useState(() =>
    fitScaleFor(images[initialIndex]!, {
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  );
  const [loadedImageSize, setLoadedImageSize] = useState<
    { index: number; width: number; height: number } | undefined
  >(undefined);
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const panStart = useRef<
    {
      x: number;
      y: number;
      panX: number;
      panY: number;
      lastX: number;
      lastY: number;
      lastAt: number;
    } | undefined
  >(undefined);
  const dragged = useRef(false);
  const dragAnimating = useRef(false);
  const panPosition = useRef({ x: 0, y: 0 });
  const panVelocity = useRef({ x: 0, y: 0 });
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragTransitioning, setIsDragTransitioning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const image = images[activeIndex]!;
  const imageDimensions =
    loadedImageSize?.index === activeIndex
      ? loadedImageSize
      : getImageDimensions(image, viewport);
  const fitScale = fitScaleFor(
    {
      ...image,
      width: imageDimensions.width,
      height: imageDimensions.height,
    },
    viewport,
  );
  const imageWidth = imageDimensions.width;
  const imageHeight = imageDimensions.height;
  const imageOverflows =
    imageWidth * scale > viewport.width - 64 ||
    imageHeight * scale > viewport.height - 64;

  const selectImage = useCallback(
    (index: number) => {
      setActiveIndex(index);
      setScale(fitScaleFor(images[index]!, viewport));
      setDragOffset(0);
      panPosition.current = { x: 0, y: 0 };
      panVelocity.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
    },
    [images, viewport],
  );

  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });

    window.addEventListener('resize', updateViewport);

    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(
    () => () => clearTimeout(transitionTimer.current),
    [],
  );

  useEffect(() => {
    panPosition.current = { x: 0, y: 0 };
    panVelocity.current = { x: 0, y: 0 };
    setPan({ x: 0, y: 0 });
  }, [scale]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;

    document.body.style.overflow = 'hidden';
    viewerRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const returnFocusTarget = returnFocusTo?.();
      const focusTarget = returnFocusTarget ?? previousActiveElement;
      const previousTabIndex = focusTarget?.getAttribute('tabindex') ?? null;

      if (focusTarget !== undefined && focusTarget.isConnected) {
        if (returnFocusTarget !== undefined && previousTabIndex === null) {
          focusTarget.setAttribute('tabindex', '-1');
        }
        focusTarget.focus();
      }
    };
  }, [returnFocusTo]);

  const move = useCallback(
    (offset: number) => {
      if (dragAnimating.current) {
        return;
      }
      const nextIndex = (activeIndex + offset + images.length) % images.length;

      selectImage(nextIndex);
    },
    [activeIndex, images.length, selectImage],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const viewerElement = viewerRef.current;
        const focusable = viewerElement?.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        );

        if (
          viewerElement === null ||
          focusable === undefined ||
          focusable.length === 0
        ) {
          event.preventDefault();
          viewerElement?.focus();

          return;
        }
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const activeElement = document.activeElement;

        if (
          activeElement === null ||
          !viewerElement.contains(activeElement)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === viewerElement)
        ) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        move(1);
      } else if (event.key === '+' || event.key === '=') {
        setScale(value => Math.min(4, value * 1.25));
      } else if (event.key === '-') {
        setScale(value => Math.max(0.05, value / 1.25));
      }
    };

    const handleWindowMouseMove = (event: MouseEvent) => {
      const panOrigin = panStart.current;

      if (panOrigin !== undefined) {
        const stage = stageRef.current;
        const stageSize = getStageSize(stage, viewport);
        const now = performance.now();
        const elapsed = Math.max(16, now - panOrigin.lastAt);
        const velocityX = (event.clientX - panOrigin.lastX) / elapsed;
        const velocityY = (event.clientY - panOrigin.lastY) / elapsed;
        const maxX = Math.max(
          0,
          (imageDimensions.width * scale - stageSize.width) / 2,
        );
        const maxY = Math.max(
          0,
          (imageDimensions.height * scale - stageSize.height) / 2,
        );
        const deltaX = event.clientX - panOrigin.x;
        const deltaY = event.clientY - panOrigin.y;

        if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
          dragged.current = true;
        }
        panStart.current = {
          ...panOrigin,
          lastX: event.clientX,
          lastY: event.clientY,
          lastAt: now,
        };
        panVelocity.current = {
          x: clamp(velocityX, -1.2, 1.2),
          y: clamp(velocityY, -1.2, 1.2),
        };
        const nextPan = {
          x: clamp(panOrigin.panX + deltaX, -maxX, maxX),
          y: clamp(panOrigin.panY + deltaY, -maxY, maxY),
        };

        panPosition.current = nextPan;
        setPan(nextPan);

        return;
      }
      const start = dragStart.current;

      if (start === undefined || dragAnimating.current) {
        return;
      }
      const deltaX = event.clientX - start.x;

      if (Math.abs(deltaX) > 3 || Math.abs(event.clientY - start.y) > 3) {
        dragged.current = true;
      }
      setDragOffset(deltaX);
    };
    const handleWindowMouseUp = (event: MouseEvent) => {
      const panOrigin = panStart.current;

      if (panOrigin !== undefined) {
        const stage = stageRef.current;
        const stageSize = getStageSize(stage, viewport);
        const maxX = Math.max(
          0,
          (imageDimensions.width * scale - stageSize.width) / 2,
        );
        const maxY = Math.max(
          0,
          (imageDimensions.height * scale - stageSize.height) / 2,
        );
        const finalDeltaX = event.clientX - panOrigin.lastX;
        const finalDeltaY = event.clientY - panOrigin.lastY;

        if (finalDeltaX !== 0 || finalDeltaY !== 0) {
          const elapsed = Math.max(16, performance.now() - panOrigin.lastAt);

          panVelocity.current = {
            x: clamp(finalDeltaX / elapsed, -1.2, 1.2),
            y: clamp(finalDeltaY / elapsed, -1.2, 1.2),
          };
        }
        const projectedPan = {
          x: clamp(
            panPosition.current.x + panVelocity.current.x * 140,
            -maxX,
            maxX,
          ),
          y: clamp(
            panPosition.current.y + panVelocity.current.y * 140,
            -maxY,
            maxY,
          ),
        };

        panStart.current = undefined;
        panVelocity.current = { x: 0, y: 0 };
        panPosition.current = projectedPan;
        setPan(projectedPan);
        setIsPanning(false);

        return;
      }
      const start = dragStart.current;

      dragStart.current = undefined;

      if (start === undefined) {
        return;
      }

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const stageWidth = getStageSize(stageRef.current, viewport).width;
      const threshold = Math.max(72, stageWidth * 0.12);

      if (Math.abs(deltaX) <= 3 && Math.abs(deltaY) <= 3) {
        return;
      }
      dragged.current = true;
      dragAnimating.current = true;
      setIsDragTransitioning(true);

      if (Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        const offset = deltaX < 0 ? 1 : -1;
        const nextIndex = (activeIndex + offset + images.length) % images.length;

        setDragOffset(-offset * stageWidth);
        transitionTimer.current = setTimeout(() => {
          selectImage(nextIndex);
          setIsDragTransitioning(false);
          dragAnimating.current = false;
        }, 240);
      } else {
        setDragOffset(0);
        transitionTimer.current = setTimeout(() => {
          setIsDragTransitioning(false);
          dragAnimating.current = false;
        }, 240);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [
    activeIndex,
    image,
    imageHeight,
    imageOverflows,
    imageWidth,
    images,
    move,
    onClose,
    selectImage,
    scale,
    viewport,
  ]);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    if (dragAnimating.current) {
      return;
    }
    const activeImage =
      event.target instanceof Element &&
      event.target.closest('.image-viewer-slide[aria-hidden="false"] .image-viewer-image');

    if (imageOverflows && activeImage !== null && activeImage !== false) {
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
        lastX: event.clientX,
        lastY: event.clientY,
        lastAt: performance.now(),
      };
      panPosition.current = pan;
      panVelocity.current = { x: 0, y: 0 };
      setIsPanning(true);
      dragged.current = false;

      return;
    }
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragged.current = false;
  };

  const viewer = (
    <div
      ref={viewerRef}
      className="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={t.imageViewer}
      tabIndex={-1}
      onClick={event => {
        if (dragged.current) {
          dragged.current = false;
        } else if (
          event.target instanceof Element &&
          event.target.closest(
            '.image-viewer-image, button, .image-viewer-toolbar',
          ) === null
        ) {
          onClose();
        }
      }}
    >
      <div className="image-viewer-backdrop" />
      <button
        className="image-viewer-close"
        type="button"
        aria-label={t.closeImageViewer}
        title={t.closeImageViewerHint}
        onClick={onClose}
      >
        <Icon name="close" />
      </button>
      <div
        ref={stageRef}
        className="image-viewer-stage"
        onMouseDown={handleMouseDown}
      >
        <div
          className={`image-viewer-track${isDragTransitioning ? ' is-settling' : ''}`}
          style={{
            transform: `translate3d(calc(-33.333333% + ${dragOffset}px), 0, 0)`,
          }}
        >
          {[-1, 0, 1].map(offset => {
            const index = (activeIndex + offset + images.length) % images.length;
            const slideImage = images[index]!;
            const slideDimensions =
              loadedImageSize?.index === index
                ? loadedImageSize
                : getImageDimensions(slideImage, viewport);
            const slideScale =
              offset === 0 ? scale : fitScaleFor(slideImage, viewport);

            return (
              <div
                key={`${offset}-${index}`}
                className="image-viewer-slide"
                aria-hidden={offset !== 0}
              >
                <div
                  className={`image-viewer-image-frame${offset === 0 && isPanning ? ' is-panning' : ''}`}
                  style={{
                    width: slideDimensions.width * slideScale,
                    height: slideDimensions.height * slideScale,
                    transform: `translate3d(${offset === 0 ? pan.x : 0}px, ${offset === 0 ? pan.y : 0}px, 0)`,
                  }}
                >
                  <img
                    key={index}
                    className="image-viewer-image"
                    src={slideImage.src}
                    alt={slideImage.alt}
                    title={slideImage.title}
                    draggable={false}
                    width={slideImage.width || undefined}
                    height={slideImage.height || undefined}
                    style={{
                      cursor:
                        offset !== 0
                          ? 'default'
                          : imageOverflows
                            ? isPanning
                              ? 'grabbing'
                              : 'grab'
                            : isSameScale(scale, fitScale)
                              ? 'zoom-in'
                              : 'zoom-out',
                    }}
                    onLoad={event => {
                      if (offset !== 0) {
                        return;
                      }
                      const { naturalWidth, naturalHeight } = event.currentTarget;

                      if (naturalWidth <= 0 || naturalHeight <= 0) {
                        return;
                      }
                      setLoadedImageSize({
                        index,
                        width: naturalWidth,
                        height: naturalHeight,
                      });
                      if (slideImage.width <= 0 || slideImage.height <= 0) {
                        const loadedImage = {
                          ...slideImage,
                          width: naturalWidth,
                          height: naturalHeight,
                        };

                        setScale(current =>
                          isSameScale(current, fitScaleFor(slideImage, viewport))
                              ? fitScaleFor(loadedImage, viewport)
                              : current,
                        );
                      }
                    }}
                    onClick={event => {
                      if (offset !== 0) {
                        return;
                      }
                      if (dragged.current) {
                        dragged.current = false;
                        event.stopPropagation();

                        return;
                      }
                      setScale(value =>
                        isSameScale(value, fitScale) ? 1 : fitScale,
                      );
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="image-viewer-toolbar" aria-label={t.imageControls}>
        <button
          className="image-viewer-control"
          type="button"
          aria-label={t.previousImage}
          title={t.previousImageHint}
          onClick={() => move(-1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <span className="image-viewer-counter" aria-live="polite">
          {activeIndex + 1} / {images.length}
        </span>
        <button
          className="image-viewer-control"
          type="button"
          aria-label={t.nextImage}
          title={t.nextImageHint}
          onClick={() => move(1)}
        >
          <Icon name="chevronRight" />
        </button>
        <span className="image-viewer-separator" />
        <button
          className="image-viewer-control"
          type="button"
          aria-label={t.zoomOut}
          title={t.zoomOutHint}
          onClick={() => setScale(value => Math.max(0.05, value / 1.25))}
        >
          <Icon name="zoomOut" />
        </button>
        <button
          className="image-viewer-control"
          type="button"
          aria-label={t.zoomIn}
          title={t.zoomInHint}
          onClick={() => setScale(value => Math.min(4, value * 1.25))}
        >
          <Icon name="zoomIn" />
        </button>
        <button
          className={`image-viewer-control image-viewer-scale${isSameScale(scale, 1) ? ' is-active' : ''}`}
          type="button"
          aria-label={t.originalImageSize}
          title={t.originalImageSizeHint}
          aria-pressed={isSameScale(scale, 1)}
          onClick={() => setScale(1)}
        >
          1:1
        </button>
        <button
          className={`image-viewer-control${isSameScale(scale, fitScale) ? ' is-active' : ''}`}
          type="button"
          aria-label={t.fitImageToScreen}
          title={t.fitImageToScreenHint}
          aria-pressed={isSameScale(scale, fitScale)}
          onClick={() => setScale(fitScale)}
        >
          <Icon name="fullscreen" />
        </button>
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}
