using System.Text;
using System.Threading.Channels;

namespace NotificationBlocker;

internal sealed class LogWriter : IAsyncDisposable
{
    private readonly string _filePath;
    private readonly Channel<string> _channel;
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _writerTask;

    public LogWriter(string filePath)
    {
        _filePath = filePath;
        Directory.CreateDirectory(Path.GetDirectoryName(_filePath) ?? AppContext.BaseDirectory);
        _channel = Channel.CreateUnbounded<string>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

        _writerTask = Task.Run(WriterLoopAsync, _cts.Token);
    }

    public void Info(string message) => Write("INFO", message);

    public void Warn(string message) => Write("WARN", message);

    public void Error(string message) => Write("ERROR", message);

    public void Debug(string message) => Write("DEBUG", message);

    private void Write(string level, string message)
    {
        var line = $"{DateTimeOffset.Now:O}\t{level}\t{message}";
        if (!_channel.Writer.TryWrite(line))
        {
            _ = _channel.Writer.WriteAsync(line);
        }

        if (OperatingSystem.IsWindows())
        {
            var consoleLine = $"[{level}] {message}";
            Console.WriteLine(consoleLine);
        }
    }

    private async Task WriterLoopAsync()
    {
        try
        {
            await foreach (var entry in _channel.Reader.ReadAllAsync(_cts.Token))
            {
                await AppendLineAsync(entry);
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on shutdown.
        }
        finally
        {
            _channel.Writer.TryComplete();
        }
    }

    private async Task AppendLineAsync(string line)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                await using var stream = new FileStream(_filePath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
                await using var writer = new StreamWriter(stream, Encoding.UTF8);
                await writer.WriteLineAsync(line);
                return;
            }
            catch (IOException)
            {
                await Task.Delay(100);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        _channel.Writer.TryComplete();
        try
        {
            await _writerTask.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Ignore.
        }
    }
}
