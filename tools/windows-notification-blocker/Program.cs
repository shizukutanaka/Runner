using NotificationBlocker;

var logger = new LogWriter(Path.Combine(AppContext.BaseDirectory, "notification-blocker.log"));

logger.Info("Windows Notification Blocker starting...");

if (!OperatingSystem.IsWindows())
{
    logger.Error("This utility can only run on Windows.");
    return;
}

var cancellation = new CancellationTokenSource();
Console.CancelKeyPress += (_, eventArgs) =>
{
    eventArgs.Cancel = true;
    cancellation.Cancel();
};

try
{
    await NotificationPolicyEnforcer.ApplyAsync(logger);
    await FocusAssistManager.EnsureFocusAssistAsync(logger);

    logger.Info("Policy application complete. Monitoring for stray notification windows...");

    var suppressor = new NotificationWindowSuppressor(logger);
    await suppressor.StartAsync(cancellation.Token);
}
catch (Exception ex)
{
    logger.Error($"Unhandled exception: {ex.Message}");
    logger.Debug(ex.ToString());
}
finally
{
    logger.Info("Windows Notification Blocker stopped.");
}
