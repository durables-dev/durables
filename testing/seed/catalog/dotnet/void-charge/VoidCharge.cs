using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Temporalio.Activities;
using Temporalio.Exceptions;

public record VoidChargeInput(string ChargeId, string Reason);

public record VoidChargeResult(string ChargeId, string Status);

public class ChargeActivities
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(10) };

    [Activity]
    public async Task<VoidChargeResult> VoidChargeAsync(VoidChargeInput input)
    {
        var info = ActivityExecutionContext.Current.Info;
        // The same key on every retry of this activity, so a retried void is not sent twice.
        var idempotencyKey = $"{info.WorkflowId}-{info.ActivityId}";
        var baseUrl = Environment.GetEnvironmentVariable("MOCK_PAYMENTS_URL");
        var apiKey = Environment.GetEnvironmentVariable("MOCK_PAYMENTS_API_KEY");

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/charges/{Uri.EscapeDataString(input.ChargeId)}/void");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Headers.Add("Idempotency-Key", idempotencyKey);
        request.Content = JsonContent.Create(new { reason = input.Reason });

        using var response = await Http.SendAsync(request, ActivityExecutionContext.Current.CancellationToken);
        if (response.StatusCode == HttpStatusCode.Conflict)
        {
            throw new ApplicationFailureException(
                $"Charge {input.ChargeId} was already captured, so it cannot be voided",
                errorType: "ChargeAlreadyCaptured",
                nonRetryable: true);
        }
        response.EnsureSuccessStatusCode();

        var charge = await response.Content.ReadFromJsonAsync<ChargeResponse>();
        return new VoidChargeResult(charge!.Id, charge.Status);
    }

    private record ChargeResponse(string Id, string Status);
}
