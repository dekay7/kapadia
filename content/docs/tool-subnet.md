---
title: Subnet Calculator
breadcrumb: docs / tools
sidebar_section: Technology Tools
tool_desc: Calculate network boundaries and host ranges from any IP/CIDR.
tool_suffix: No data sent.
---

# Subnet Calculator

> [!NOTE]
> This tool is 100% client-side. No data is sent to any server or third-party service.

The Subnet Calculator computes network boundaries, host ranges, and masks from an IP address and CIDR prefix.

---

## What Is a Subnet?

An IP address (like `192.168.1.1`) identifies a single device on a network. A **subnet** is a way of dividing a large network into smaller, more manageable pieces. It's like having a large neighborhood and dividing it into specific blocks or streets.

## What Is This Tool For?

This tool helps network administrators (and curious users) understand how a network is divided up. If you give it an IP address and a "prefix", it will tell you exactly which range of addresses belong to that specific "block," where the block starts and ends, and how many devices can fit inside it.

---

## Output Fields

| Field | Description |
|---|---|
| **IP Address** | The input IP, formatted |
| **Network Address** | First address in the subnet (all host bits zero) |
| **Usable Host Range** | First to last assignable host addresses |
| **Broadcast Address** | Last address in the subnet (all host bits one) |
| **Total Hosts** | 2^(32 − prefix) |
| **Usable Hosts** | Total hosts − 2 (network + broadcast) |
| **Subnet Mask** | Dotted-decimal representation of the prefix mask |
| **Wildcard Mask** | Bitwise inverse of the subnet mask |
| **Binary Subnet** | 32-bit binary representation of the subnet mask |

---

## Supported Input

- **IPv4** addresses with CIDR notation (/0 – /32)
- Values update live as you type

---

## Privacy & Data Sources

No third-party services are used. All calculations are pure JavaScript running in your browser using bitwise arithmetic. Nothing is sent over the network.
