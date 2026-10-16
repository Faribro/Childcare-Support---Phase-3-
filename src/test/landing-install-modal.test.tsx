import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstallDownloadModal } from '@/components/landing/InstallDownloadModal';
import {
  ReleaseManifest,
  validateReleaseManifest,
  formatFileSizeBytes,
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
    const insecureManifest: ReleaseManifest = {
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
    const unapprovedOriginManifest: ReleaseManifest = {
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
    const signedUrlManifest: ReleaseManifest = {
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

  it('displays approved native APK release artifact with exact version, size and safety metadata', () => {
    render(<InstallDownloadModal {...defaultProps} />);
    
    // Android tab active by default
    expect(screen.getByText(/direct apk download/i)).toBeDefined();
    expect(screen.getByText(/v3\.0\.0-rc1/i)).toBeDefined();
    expect(screen.getByText(/android 8\.0\+/i)).toBeDefined();
    expect(screen.getByText(/28\.5 mb/i)).toBeDefined();
    expect(screen.getByText(/internal/i)).toBeDefined();
  });

  it('provides honest download feedback on APK click without claiming installed', async () => {
    render(<InstallDownloadModal {...defaultProps} />);
    
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
});
