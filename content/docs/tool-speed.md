---
title: Speed Test
breadcrumb: docs / tools
sidebar_section: Technology Tools
sidebar_order: 0
---

# Speed Test

## What is a Speed Test?

An internet **speed test** measures how quickly your device can send and receive information from the internet. It's like measuring the flow of water through a pipe—some pipes are wider (more speed) and some are narrower (less speed).

## What is this tool for?

This tool helps you diagnose issues with your internet connection. If videos are buffering or websites are loading slowly, a speed test can tell you if the problem is with your internet provider or something else. It measures three main things:
- **Download**: How fast you receive data (e.g., watching a movie).
- **Upload**: How fast you send data (e.g., posting a photo).
- **Ping/Latency**: How quickly your connection reacts (e.g., for gaming or video calls).

---

## Metrics Explained

- **Download Speed**: Data transferred from the internet to your device. Measured in Mbps (Megabits per second).
- **Upload Speed**: Data transferred from your device to the internet. Measured in Mbps.
- **Latency (Ping)**: The round-trip time (RTT) for a small packet to reach the server and return. Measured in milliseconds (ms).
- **Jitter**: The variation in latency over time. High jitter can cause stuttering in real-time applications like VOIP or gaming.

## Technical Details

### Parallel Steaming
Standard browser downloads often fail to saturate high-speed connections (like Gigabit fiber) because a single TCP stream is limited by "slow-start" and window scaling. Our tool opens **4 parallel streams** for both download and upload, allowing us to fill the bandwidth pipe and measure your true maximum throughput.

### Global Edge Infrastructure
Unlike traditional speed tests that might route your traffic to a far-away server, this tool targets the Cloudflare global edge network. Your traffic is routed to the nearest available data center (PoP), providing a measurement of your "last mile" performance.

## Privacy & Security

### No Data Retention
kapadia.org does not log or store your speed test results, your IP address, or your location. The test is conducted entirely in your browser using temporary fetches that are discarded immediately after the test completes.

### Secure Transport
All test traffic is conducted over HTTPS (TLS 1.3), ensuring that the data being sent to and from your device cannot be intercepted or modified by third parties.

### Third-Party Exposure
The test traffic is directed to `speed.cloudflare.com`. As with any network request, Cloudflare can see your public IP address to route the traffic. No identifying information (like headers or cookies) is sent from kapadia.org to Cloudflare during the test. For more details, see [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).
