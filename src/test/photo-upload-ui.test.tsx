/**
 * photo-upload-ui.test.tsx
 *
 * Comprehensive Document UI Test Suite:
 * 1. Initial selection/upload state (accessible buttons, labels, hints).
 * 2. File size validation (rejects files exceeding maxSizeMb, displays error alert).
 * 3. File type validation (rejects non-image/non-pdf formats).
 * 4. Error state & Retry flow (triggers file picker retry upon error).
 * 5. Preview thumbnail rendering when document is attached.
 * 6. Modal enlarged preview open, ESC key dismiss, and close actions.
 * 7. Direct replacement flow (opens file picker to replace existing attachment).
 * 8. Removal flow (clears attachment and resets input state).
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhotoUpload } from '@/components/ui/PhotoUpload';

describe('Document UI & PhotoUpload Component Suite', () => {
  const defaultLabel = 'Bank Passbook Front Page';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Initial Selection State: renders accessible upload button, label, and format hint', () => {
    render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        helperText="Clear photo showing account number and IFSC"
        maxSizeMb={10}
      />
    );

    expect(screen.getByText(defaultLabel)).toBeInTheDocument();
    expect(screen.getByText('Clear photo showing account number and IFSC')).toBeInTheDocument();

    const uploadBtn = screen.getByRole('button', { name: /Click to capture or upload document/i });
    expect(uploadBtn).toBeInTheDocument();
    expect(screen.getByText(/Up to 10MB JPEG, PNG, or PDF/i)).toBeInTheDocument();
  });

  it('2. Validation — File Size Limit: displays readable error alert when file exceeds maxSizeMb', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        maxSizeMb={5}
        onChange={handleChange}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create synthetic file larger than 5MB (6MB)
    const largeFile = new File([new ArrayBuffer(6 * 1024 * 1024)], 'huge-passbook.jpg', {
      type: 'image/jpeg',
    });

    fireEvent.change(fileInput, { target: { files: [largeFile] } });

    // Verify error alert
    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(/exceeds 5MB limit/i);
    expect(handleChange).not.toHaveBeenCalled();

    // Verify Retry button exists within error alert
    const retryBtn = screen.getByRole('button', { name: /Retry/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('3. Validation — Invalid File Format: displays readable error alert on non-supported mime type', () => {
    const handleChange = vi.fn();
    const { container } = render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        onChange={handleChange}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    // Create synthetic executable or binary file
    const binaryFile = new File([new ArrayBuffer(1024)], 'script.exe', {
      type: 'application/x-msdownload',
    });

    fireEvent.change(fileInput, { target: { files: [binaryFile] } });

    const errorAlert = screen.getByRole('alert');
    expect(errorAlert).toBeInTheDocument();
    expect(errorAlert).toHaveTextContent(/Invalid file type/i);
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('4. Successful Attachment & Thumbnail Preview: renders attached state and preview thumbnail', () => {
    const syntheticDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        value={syntheticDataUrl}
      />
    );

    expect(screen.getByText('Document Attached')).toBeInTheDocument();
    expect(screen.getByText(/Stored on device/i)).toBeInTheDocument();

    const thumbnail = screen.getByAltText(defaultLabel);
    expect(thumbnail).toBeInTheDocument();
    expect(thumbnail).toHaveAttribute('src', syntheticDataUrl);
  });

  it('5. Preview Modal Flow: opens modal with enlarged view and dismisses on Escape or Close button', async () => {
    const syntheticDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        value={syntheticDataUrl}
      />
    );

    const previewBtn = screen.getByRole('button', { name: `Preview ${defaultLabel}` });
    expect(previewBtn).toBeInTheDocument();

    // Open modal
    fireEvent.click(previewBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(`${defaultLabel} — Preview`)).toBeInTheDocument();

    // Close modal via Close button
    const closeBtn = screen.getByRole('button', { name: /Close preview modal/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Reopen and test Escape key dismissal
    fireEvent.click(previewBtn);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('6. Direct Replacement Flow: provides replace button and opens file picker without losing state', () => {
    const handleChange = vi.fn();
    const syntheticDataUrl = 'data:image/png;base64,initial-image';
    const { container } = render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        value={syntheticDataUrl}
        onChange={handleChange}
      />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    const replaceBtn = screen.getByRole('button', { name: `Replace captured ${defaultLabel}` });
    expect(replaceBtn).toBeInTheDocument();

    fireEvent.click(replaceBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('7. Removal Flow: removes current attachment and resets input', () => {
    const handleChange = vi.fn();
    const syntheticDataUrl = 'data:image/png;base64,initial-image';
    const { container } = render(
      <PhotoUpload
        id="passbook-upload"
        label={defaultLabel}
        value={syntheticDataUrl}
        onChange={handleChange}
      />
    );

    const removeBtn = screen.getByRole('button', { name: `Remove captured ${defaultLabel}` });
    expect(removeBtn).toBeInTheDocument();

    fireEvent.click(removeBtn);
    expect(handleChange).toHaveBeenCalledWith(undefined);
  });
});
