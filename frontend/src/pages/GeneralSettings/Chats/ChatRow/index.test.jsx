import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatRow from './index';

// Mock dependencies
vi.mock('@/models/system', () => ({
  default: {
    deleteChat: vi.fn().mockResolvedValue({ success: true }),
  },
}));

vi.mock('@/hooks/useModal', () => ({
  useModal: () => ({
    isOpen: false,
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}));

vi.mock('@/components/ModalWrapper', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
}));

vi.mock('../MarkdownRenderer', () => ({
  default: ({ content }) => <div>{content}</div>,
}));

vi.mock('@/utils/request', () => ({
  safeJsonParse: (str, defaultValue) => {
    try {
      return JSON.parse(str);
    } catch {
      return defaultValue;
    }
  },
}));

describe('ChatRow', () => {
  const mockOnDelete = vi.fn();
  const mockChat = {
    id: 1,
    prompt: 'What is AI?',
    response: JSON.stringify({ text: 'AI is artificial intelligence' }),
    createdAt: '2024-01-15 10:00:00',
    user: { username: 'testuser' },
    workspace: { name: 'Test Workspace' },
    llmMessageLog: {
      compressedMessages: JSON.stringify([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'What is AI?' },
      ]),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm
    window.confirm = vi.fn(() => true);
  });

  it('should render chat data correctly', () => {
    render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('testuser')).toBeInTheDocument();
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    expect(screen.getByText('What is AI?')).toBeInTheDocument();
  });

  it('should display compressed messages when llmMessageLog exists', () => {
    render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    // The compressed messages should be truncated and displayed
    const llmMessagesCell = screen.getByText(/system/);
    expect(llmMessagesCell).toBeInTheDocument();
  });

  it('should display "-" when llmMessageLog is null', () => {
    const chatWithoutLog = {
      ...mockChat,
      llmMessageLog: null,
    };

    render(<ChatRow chat={chatWithoutLog} onDelete={mockOnDelete} />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('should display "-" when llmMessageLog exists but compressedMessages is null', () => {
    const chatWithEmptyLog = {
      ...mockChat,
      llmMessageLog: {
        compressedMessages: null,
      },
    };

    render(<ChatRow chat={chatWithEmptyLog} onDelete={mockOnDelete} />);

    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('should handle empty compressedMessages array', () => {
    const chatWithEmptyMessages = {
      ...mockChat,
      llmMessageLog: {
        compressedMessages: JSON.stringify([]),
      },
    };

    render(<ChatRow chat={chatWithEmptyMessages} onDelete={mockOnDelete} />);

    expect(screen.getByText('[]')).toBeInTheDocument();
  });

  it('should display response text', () => {
    render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    expect(screen.getByText('AI is artificial intelligence')).toBeInTheDocument();
  });

  it('should call onDelete when delete button is clicked', async () => {
    const { default: System } = await import('@/models/system');

    render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    const deleteButton = screen.getByRole('button');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(System.deleteChat).toHaveBeenCalledWith(1);
      expect(mockOnDelete).toHaveBeenCalledWith(1);
    });
  });

  it('should not delete when confirmation is cancelled', () => {
    window.confirm = vi.fn(() => false);

    render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    const deleteButton = screen.getByRole('button');
    fireEvent.click(deleteButton);

    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it('should render all cells in correct order', () => {
    const { container } = render(<ChatRow chat={mockChat} onDelete={mockOnDelete} />);

    const cells = container.querySelectorAll('td');
    expect(cells).toHaveLength(8); // id, user, workspace, prompt, llmMessages, response, createdAt, delete button
  });
});
