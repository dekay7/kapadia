document.addEventListener('DOMContentLoaded', () => {
  const ipInput = document.getElementById('subnet-ip');
  const cidrInput = document.getElementById('subnet-cidr');

  const outIp = document.getElementById('out-ip');
  const outNetwork = document.getElementById('out-network');
  const outRange = document.getElementById('out-range');
  const outBroadcast = document.getElementById('out-broadcast');
  const outHosts = document.getElementById('out-hosts');
  const outUsable = document.getElementById('out-usable');
  const outMask = document.getElementById('out-mask');
  const outWildcard = document.getElementById('out-wildcard');
  const outBinary = document.getElementById('out-binary');

  const ip2long = (ip) => {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  };

  const long2ip = (long) => {
    return [
      (long >>> 24) & 255,
      (long >>> 16) & 255,
      (long >>> 8) & 255,
      long & 255
    ].join('.');
  };

  const calculate = () => {
    const ipStr = ipInput.value.trim();
    let cidr = parseInt(cidrInput.value, 10);

    // Basic IPv4 regex
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    if (!ipv4Regex.test(ipStr)) {
      outIp.textContent = 'Invalid IPv4 Address';
      outNetwork.textContent = '...';
      outRange.textContent = '...';
      outBroadcast.textContent = '...';
      outHosts.textContent = '...';
      outUsable.textContent = '...';
      outMask.textContent = '...';
      outWildcard.textContent = '...';
      outBinary.textContent = '...';
      return;
    }

    if (isNaN(cidr) || cidr < 0 || cidr > 32) {
      cidr = 24; // Default
    }

    const ipLong = ip2long(ipStr);
    const maskLong = (0xFFFFFFFF << (32 - cidr)) >>> 0;
    const networkLong = (ipLong & maskLong) >>> 0;
    const wildcardLong = (~maskLong) >>> 0;
    const broadcastLong = (networkLong | wildcardLong) >>> 0;

    let firstHostLong = networkLong + 1;
    let lastHostLong = broadcastLong - 1;

    let totalHosts = 2 ** (32 - cidr);
    let usableHosts = totalHosts > 2 ? totalHosts - 2 : 0;

    if (cidr === 32) {
      firstHostLong = networkLong;
      lastHostLong = networkLong;
      usableHosts = 1;
    } else if (cidr === 31) {
      firstHostLong = networkLong;
      lastHostLong = broadcastLong;
      usableHosts = 2;
    }

    outIp.textContent = ipStr;
    outNetwork.textContent = `${long2ip(networkLong)}/${cidr}`;
    outBroadcast.textContent = long2ip(broadcastLong);
    
    if (cidr === 32) {
      outRange.textContent = long2ip(firstHostLong);
    } else {
      outRange.textContent = `${long2ip(firstHostLong)} - ${long2ip(lastHostLong)}`;
    }
    
    outHosts.textContent = totalHosts.toLocaleString();
    outUsable.textContent = usableHosts.toLocaleString();
    outMask.textContent = long2ip(maskLong);
    outWildcard.textContent = long2ip(wildcardLong);

    // Binary representation of mask
    const binString = maskLong.toString(2).padStart(32, '0');
    outBinary.textContent = binString.match(/.{1,8}/g).join('.');
  };

  ipInput.addEventListener('input', calculate);
  cidrInput.addEventListener('input', calculate);

  // Initial calculation
  calculate();
});
