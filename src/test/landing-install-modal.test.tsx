import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstallDownloadModal } from '@/components/landing/InstallDownloadModal';
import {
  ReleaseManifest,
  validateReleaseManifest,
  formatFileSizeBytes,
  configureApprovedOrigins,
  resetApprovedOrigins,
} from '@/lib/release/releaseManifestContract';
import { DEFAULT_RELEASE_MANIFEST } from '@/lib/release/defaultReleaseManifest';

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href, className, 'aria-label': ariaLabel, onClick, ...rest }: any) => (
    <a href={href} className={className} aria-label={ariaLabel} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

describe('Release Manifest Contract & Safety Validation', () => {
  it('validates a compliant manifest successfully', () => {
    const result = validateReleaseManifest(DEFAULT_RELEASE_MANIFEST);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.manifest).toBeDefined();
  });

  it('rejects manifest entries using insecure http:// links', () => {
    const insecureManifest: any = {
      ...DEFAULT_RELEASE_MANIFEST,
      nativeArtifacts: [
        {
          platform: 'android',
          architecture: 'all',
          channel: 'internal',
          version: '3.0.0-rc1',
          minOsVersion: 'Android 8.0+',
          fileSizeBytes: 29884416,
          downloadUrl: 'http://allianceindia.org/downloads/childcare-internal-v3.0.0.apk',
          publishedAt: '2026-10-15T00:00:00Z',
        },
      ],
    };
    const result = validateReleaseManifest(insecureManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('insecure HTTP'))).toBe(true);
  });

  it('rejects manifest entries with unapproved host origins', () => {
    const unapprovedOriginManifest: any = {
      ...DEFAULT_RELEASE_MANIFEST,
      nativeArtifacts: [
        {
          platform: 'android',
          architecture: 'all',
          channel: 'internal',
          version: '3.0.0-rc1',
          minOsVersion: 'Android 8.0+',
          fileSizeBytes: 29884416,
          downloadUrl: 'https://malicious-thirdparty-cdn.com/app.apk',
          publishedAt: '2026-10-15T00:00:00Z',
        },
      ],
    };
    const result = validateReleaseManifest(unapprovedOriginManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not in the approved origin allowlist'))).toBe(true);
  });

  it('rejects URLs containing signed query tokens or credentials', () => {
    const signedUrlManifest: any = {
      ...DEFAULT_RELEASE_MANIFEST,
      nativeArtifacts: [
        {
          platform: 'android',
          architecture: 'all',
          channel: 'internal',
          version: '3.0.0-rc1',
          minOsVersion: 'Android 8.0+',
          fileSizeBytes: 29884416,
          downloadUrl: 'https://github.com/Faribro/Childcare-Support---Phase-3-/releases/download/v3.0.0-internal/app.apk?token=secret123',
          publishedAt: '2026-10-15T00:00:00Z',
        },
      ],
    };
    const result = validateReleaseManifest(signedUrlManifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('private or signed URL query tokens'))).toBe(true);
  });

  it('formats file sizes accurately into human-readable strings', () => {
    expect(formatFileSizeBytes(0)).toBe('0 B');
    expect(formatFileSizeBytes(1024)).toBe('1.0 KB');
    expect(formatFileSizeBytes(1048576)).toBe('1.0 MB');
    expect(formatFileSizeBytes(29884416)).toBe('28.5 MB');
  });
});

describe('InstallDownloadModal Component (src/components/landing/InstallDownloadModal.tsx)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    canInstallPwa: true,
    hasPrompt: false,
    isStandalone: false,
    onPromptInstall: vi.fn().mockResolvedValue('accepted'),
    manifest: DEFAULT_RELEASE_MANIFEST,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetApprovedOrigins();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<InstallDownloadModal {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog landmark with correct accessibility attributes', () => {
    render(<InstallDownloadModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('install-modal-title');
    expect(screen.getByRole('heading', { name: /install & download childcare support/i })).toBeDefined();
  });

  it('allows manual tab switching between Android, iPhone / iPad, and Desktop', () => {
    render(<InstallDownloadModal {...defaultProps} />);

    const androidTab = screen.getByRole('tab', { name: /android/i });
    const iosTab = screen.getByRole('tab', { name: /iphone \/ ipad/i });
    const desktopTab = screen.getByRole('tab', { name: /desktop/i });

    expect(androidTab).toBeDefined();
    expect(iosTab).toBeDefined();
    expect(desktopTab).toBeDefined();

    // Click iOS tab
    fireEvent.click(iosTab);
    expect(iosTab.getAttribute('aria-selected')).toBe('true');
    expect(androidTab.getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText(/apple ios requires adding pwas to your home screen from safari/i)).toBeDefined();

    // Click Desktop tab
    fireEvent.click(desktopTab);
    expect(desktopTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/install on windows, macos or linux/i)).toBeDefined();

    // Switch back to Android tab
    fireEvent.click(androidTab);
    expect(androidTab.getAttribute('aria-selected')).toBe('true');
  });

  it('triggers PWA prompt on Android when hasPrompt is true', async () => {
    const onPromptInstallMock = vi.fn().mockResolvedValue('accepted');
    render(
      <InstallDownloadModal
        {...defaultProps}
        hasPrompt={true}
        onPromptInstall={onPromptInstallMock}
      />
    );

    const installPwaBtn = screen.getByRole('button', { name: /install web app \(pwa\)/i });
    expect(installPwaBtn).toBeDefined();

    fireEvent.click(installPwaBtn);
    expect(onPromptInstallMock).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.getByText(/web app installation prompt accepted/i)).toBeDefined();
    });
  });

  it('displays browser instructions on Android when hasPrompt is false', () => {
    render(<InstallDownloadModal {...defaultProps} hasPrompt={false} />);
    expect(screen.getByText(/how to add to home screen in mobile browsers/i)).toBeDefined();
    expect(screen.getByText(/in chrome or edge/i)).toBeDefined();
  });

  it('default manifest renders zero direct native APK downloads and displays pilot restriction notice', () => {
    render(<InstallDownloadModal {...defaultProps} />);

    // Android tab active by default
    expect(screen.queryByRole('link', { name: /download apk/i })).toBeNull();
    expect(
      screen.getByText(/native google play and apk packages are currently restricted to authorized internal pilots/i)
    ).toBeDefined();
    expect(screen.getByText(/use the pwa above for full casework features/i)).toBeDefined();
  });

  it('displays approved native APK release artifact with exact version, size and safety metadata when supplied in fixture', () => {
    configureApprovedOrigins(['https://github.com']);
    const illustrativeNativeManifest: ReleaseManifest = {
      ...DEFAULT_RELEASE_MANIFEST,
      nativeArtifacts: [
        {
          id: 'android-pilot-apk',
          platform: 'android',
          platformLabel: 'Android Client (Field APK)',
          artifactFormat: 'apk_universal',
          directInstallable: true,
          pwaInstallable: false,
          verifiedOfflineSupport: false,
          version: '3.0.0-rc1',
          versionCode: 300,
          minimumOS: 'Android 8.0+',
          minOsVersion: 'Android 8.0+',
          fileSizeBytes: 29884416,
          downloadUrl: 'https://github.com/Faribro/Childcare-Support---Phase-3-/releases/download/v3.0.0-internal/app-arm64-release.apk',
          channel: 'production',
          signingStatus: 'release_signed',
          status: 'available',
          sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          releaseNotes: 'Offline casework engine with peer-to-peer sync',
          publishedAt: '2026-10-15T00:00:00Z',
        },
      ],
    };

    render(<InstallDownloadModal {...defaultProps} manifest={illustrativeNativeManifest} />);

    expect(screen.getByText(/direct apk download/i)).toBeDefined();
    expect(screen.getByText(/v3\.0\.0-rc1/i)).toBeDefined();
    expect(screen.getByText(/android 8\.0\+/i)).toBeDefined();
    expect(screen.getByText(/28\.5 mb/i)).toBeDefined();
    expect(screen.getByText(/offline casework engine with peer-to-peer sync/i)).toBeDefined();
  });

  it('provides honest download feedback on APK click without claiming installed', async () => {
    configureApprovedOrigins(['https://github.com']);
    const illustrativeNativeManifest: ReleaseManifest = {
      ...DEFAULT_RELEASE_MANIFEST,
      nativeArtifacts: [
        {
          id: 'android-pilot-apk',
          platform: 'android',
          platformLabel: 'Android Client (Field APK)',
          artifactFormat: 'apk_universal',
          directInstallable: true,
          pwaInstallable: false,
          verifiedOfflineSupport: false,
          version: '3.0.0-rc1',
          versionCode: 300,
          minimumOS: 'Android 8.0+',
          minOsVersion: 'Android 8.0+',
          fileSizeBytes: 29884416,
          downloadUrl: 'https://github.com/Faribro/Childcare-Support---Phase-3-/releases/download/v3.0.0-internal/app-arm64-release.apk',
          channel: 'production',
          signingStatus: 'release_signed',
          status: 'available',
          sha256Checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          publishedAt: '2026-10-15T00:00:00Z',
        },
      ],
    };

    render(<InstallDownloadModal {...defaultProps} manifest={illustrativeNativeManifest} />);

    const downloadApkLink = screen.getByRole('link', { name: /download apk \(28\.5 mb\)/i });
    expect(downloadApkLink.getAttribute('href')).toBe(
      'https://github.com/Faribro/Childcare-Support---Phase-3-/releases/download/v3.0.0-internal/app-arm64-release.apk'
    );

    fireEvent.click(downloadApkLink);

    await waitFor(() => {
      const feedback = screen.getByRole('status');
      expect(feedback.textContent).toContain('Download initiated');
      expect(feedback.textContent).toContain('Open the downloaded file on your device to install');
      expect(feedback.textContent).not.toContain('Successfully installed');
    });
  });

  it('displays accurate Safari Add-to-Home-Screen steps for iPhone / iPad', () => {
    render(<InstallDownloadModal {...defaultProps} />);

    const iosTab = screen.getByRole('tab', { name: /iphone \/ ipad/i });
    fireEvent.click(iosTab);

    expect(screen.getByText(/tap the share button/i)).toBeDefined();
    expect(screen.getByText(/scroll down and tap "add to home screen"/i)).toBeDefined();
    expect(screen.getByText(/tap add in the top right corner/i)).toBeDefined();
  });

  it('always provides persistent "Continue in browser" linking to /app', () => {
    render(<InstallDownloadModal {...defaultProps} />);

    const continueLinks = screen.getAllByRole('link', { name: /continue in browser/i });
    expect(continueLinks.length).toBeGreaterThanOrEqual(1);
    continueLinks.forEach((link) => {
      expect(link.getAttribute('href')).toBe('/app');
    });
  });

  it('handles Escape key to close the modal', () => {
    const onCloseMock = vi.fn();
    render(<InstallDownloadModal {...defaultProps} onClose={onCloseMock} />);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('handles close button click', () => {
    const onCloseMock = vi.fn();
    render(<InstallDownloadModal {...defaultProps} onClose={onCloseMock} />);

    const closeBtn = screen.getByRole('button', { name: /close installation dialog/i });
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('restores focus to previous active element upon close', () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Open Dialog';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const { rerender } = render(<InstallDownloadModal {...defaultProps} isOpen={true} />);
    const closeBtn = screen.getByRole('button', { name: /close installation dialog/i });
    expect(document.activeElement).toBe(closeBtn);

    rerender(<InstallDownloadModal {...defaultProps} isOpen={false} />);
    expect(document.activeElement).toBe(triggerBtn);
    document.body.removeChild(triggerBtn);
  });

  it('supports WAI-ARIA arrow key navigation across tabs', () => {
    render(<InstallDownloadModal {...defaultProps} />);

    const androidTab = screen.getByRole('tab', { name: /android/i });
    const iosTab = screen.getByRole('tab', { name: /iphone \/ ipad/i });
    const desktopTab = screen.getByRole('tab', { name: /desktop/i });

    androidTab.focus();
    expect(document.activeElement).toBe(androidTab);

    // ArrowRight moves from Android to iOS
    fireEvent.keyDown(androidTab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(iosTab);
    expect(iosTab.getAttribute('aria-selected')).toBe('true');

    // ArrowRight moves from iOS to Desktop
    fireEvent.keyDown(iosTab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(desktopTab);
    expect(desktopTab.getAttribute('aria-selected')).toBe('true');

    // ArrowRight wraps around from Desktop back to Android
    fireEvent.keyDown(desktopTab, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(androidTab);
    expect(androidTab.getAttribute('aria-selected')).toBe('true');

    // ArrowLeft moves from Android to Desktop
    fireEvent.keyDown(androidTab, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(desktopTab);
    expect(desktopTab.getAttribute('aria-selected')).toBe('true');

    // Home moves to first tab (Android)
    fireEvent.keyDown(desktopTab, { key: 'Home' });
    expect(document.activeElement).toBe(androidTab);

    // End moves to last tab (Desktop)
    fireEvent.keyDown(androidTab, { key: 'End' });
    expect(document.activeElement).toBe(desktopTab);
  });

  it('locks body scroll when modal is open and restores pre-existing overflow value when closed or unmounted', () => {
    document.body.style.overflow = 'scroll';
    const { rerender, unmount } = render(<InstallDownloadModal {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<InstallDownloadModal {...defaultProps} isOpen={false} />);
    expect(document.body.style.overflow).toBe('scroll');

    // Test unmount restoration as well
    rerender(<InstallDownloadModal {...defaultProps} isOpen={true} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');

    // Cleanup
    document.body.style.overflow = '';
  });

  it('traps focus inside the modal dialog on Tab and Shift+Tab', () => {
    render(<InstallDownloadModal {...defaultProps} />);
    const closeBtn = screen.getByRole('button', { name: /close installation dialog/i });
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const lastElement = focusable[focusable.length - 1];

    // Tabbing from last element loops to closeBtn
    lastElement.focus();
    fireEvent.keyDown(lastElement, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    // Shift+Tabbing from closeBtn loops to lastElement
    closeBtn.focus();
    fireEvent.keyDown(closeBtn, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastElement);
  });
});
