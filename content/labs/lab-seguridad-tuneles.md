+++
draft = false
title = "Implementación de Seguridad sobre Túneles"
date = 2026-11-10T08:00:00Z
description = "Laboratorio de seguridad y alta disponibilidad: VLANs, EtherChannel, HSRP, VPN site-to-site IPSec entre R2 y R3, OSPF multiárea, summarización, DHCP y MP-BGP."
weight = 10
tags = []
categories = []
slug = ""
authors = []
externalLink = ""
series = []
+++

---
- Tags: #IPSec #VPN #GRE #HSRP #OSPF #BGP #Túneles
---

# Introducción

Este laboratorio une dos sedes a través de una **VPN site-to-site IPSec** y las integra con una red de campus redundante. El escenario combina seguridad, alta disponibilidad y enrutamiento avanzado:

- VLANs y troncales 802.1Q con EtherChannel y Rapid PVST+.
- Port-security y estabilización de STP en los puertos de acceso.
- Routing inter-VLAN con **router-on-a-stick** en R2 y R3.
- **HSRPv2** para IPv4 e IPv6, con preferencias cruzadas entre R2 y R3.
- **VPN site-to-site IPSec** entre R2 y R3.
- OSPF multiárea (área 100 y área 0) con summarización.
- DHCP IPv4 e IPv6 centralizado en R1.
- MP-BGP con el ISP y un router externo (BR), incluyendo manipulación del AS_PATH.

# Topología

<img src="/images/Pasted image 20250621202451.png" style="width:100%; height:auto; display:block; margin:auto;">

- **R1 (AS 100)**: router central. Conecta con R2 (`192.168.12.0/24`), R3 (`192.168.13.0/24`) y el ISP (`209.50.0.0/30`). Es el servidor DHCP.
- **R2**: router de la sede A. Loopback `2.2.2.2/32`; conecta con R1 y con SWA por un troncal.
- **R3**: router de la sede B. Loopback `3.3.3.3/32`; conecta con R1 y con SWB por un troncal.
- **SWA, SWB, SWC y SWD**: switches de acceso con enlaces redundantes.
- **ISP (AS 200)**: proveedor con loopback `8.8.8.8/32`.
- **BR (AS 300)**: router externo con loopback `192.168.100.1/32`.

| VLAN | Nombre | IPv4 | IPv6 |
|---|---|---|---|
| 21 | Finanzas | `10.0.21.0/24` | `3001:ABCD:ABCD:A::/64` |
| 22 | Gestión | `10.0.31.0/24` | `3001:ABCD:ABCD:B::/64` |
| 23 | Fuerza/Ventas | `10.0.41.0/24` | `3001:ABCD:ABCD:C::/64` |
| 24 | RRHH | `10.0.51.0/24` | `3001:ABCD:ABCD:D::/64` |
| 25 | Administración | `10.0.61.0/24` | `3001:ABCD:ABCD:E::/64` |

# Requerimientos

- Crear las VLAN 21 a 25 en todos los switches.
- Implementar EtherChannel con los grupos solicitados.
- Habilitar Rapid PVST+ en todos los switches de capa 2.
- Limitar a 2 MAC por puerto de acceso y apagar el puerto ante violación.
- Implementar mecanismos de estabilización de STP.
- VLAN 21 no debe comunicarse con VLAN 22 mediante **PACL**.
- VLAN 23 no debe comunicarse con VLAN 24 mediante **VACL**.
- Hacer el routing inter-VLAN en R2 y R3.
- Implementar HSRPv2: VLAN 21/22 prefieren R2 y VLAN 23/24 prefieren R3.
- Usar la última IP asignable como gateway IPv4 (`.254`) y `::FF` en IPv6.
- Implementar una VPN site-to-site entre R2 y R3.
- Implementar OSPF en IPv4 e IPv6.
- Sumarizar las rutas del área 100 para que se vean en el área 0.
- Implementar MP-BGP con las loopbacks como prefijos.
- Influir en el enlace ISP-BR con `route-map` para que el path muestre dos AS 200 en IPv4 y tres AS 200 en IPv6.
- Redistribuir IGP y EGP en IPv4 e IPv6.
- Comprobar conectividad completa en ambos protocolos.

# Desarrollo

## 1. VLANs y VTP transparente

```bash
en
conf t
vlan 21,22,23,24,25
ex
vtp mode transparent
```

> Repite el bloque en **SWA, SWB, SWC y SWD**.

## 2. Puertos de acceso con port-security

**SWC** — VLAN 21 y 22

```bash
int e0/2
sw mo acc
sw acc vlan 21
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 22
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

**SWD** — VLAN 23 y 24

```bash
int e0/2
sw mo acc
sw acc vlan 23
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
int e0/3
sw mo acc
sw acc vlan 24
sw port-security
switchport port-security mac-address sticky
switchport port-security maximum 2
switchport port-security violation shutdown
spanning-tree bpduguard enable
spanning-tree bpdufilter enable
spanning-tree portfast
no shut
ex
```

## 3. Troncales 802.1Q

**SWA**

```bash
int ran e1/0-3, e0/0-1, e0/3
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 21,22,23,24,25
sw nonegotiate
no shut
ex
```

**SWB**

```bash
int ran e1/0-3, e0/0-1, e0/3
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 21,22,23,24,25
sw nonegotiate
no shut
ex
```

**SWC**

```bash
int ran e1/0-3, e0/0-1
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 21,22,23,24,25
sw nonegotiate
no shut
ex
```

**SWD**

```bash
int ran e1/0-3, e0/0-1
sw mo tr
sw tr encapsulation dot1q
sw tr all vlan 21,22,23,24,25
sw nonegotiate
no shut
ex
```

## 4. EtherChannel

| Port-channel | Switches | Modo | Interfaces |
|---|---|---|---|
| Po6 | SWA-SWB | LACP active/passive | e1/0-1 |
| Po5 | SWA-SWC | Estático `on` | e1/2-3 |
| Po4 | SWB-SWC | PAgP desirable/auto | e0/0-1 |
| Po2 | SWA-SWD | LACP active/passive | e0/0-1 |
| Po3 | SWB-SWD | Estático `on` | e1/2-3 |
| Po1 | SWC-SWD | PAgP desirable/auto | e1/0-1 |

**SWA**

```bash
int ran e1/0-1
channel-group 6 mode active
ex
int ran e0/0-1
channel-group 2 mode active
ex
int ran e1/2-3
channel-group 5 mode on
ex
```

**SWB**

```bash
int ran e1/0-1
channel-group 6 mode passive
ex
int ran e0/0-1
channel-group 4 mode desirable
ex
int ran e1/2-3
channel-group 3 mode on
ex
```

**SWC**

```bash
int ran e1/0-1
channel-group 1 mode desirable
ex
int ran e0/0-1
channel-group 4 mode auto
ex
int ran e1/2-3
channel-group 5 mode on
ex
```

**SWD**

```bash
int ran e1/0-1
channel-group 1 mode auto
ex
int ran e0/0-1
channel-group 2 mode passive
ex
int ran e1/2-3
channel-group 3 mode on
ex
```

## 5. Rapid PVST+ y administración remota

**SWA** — `10.0.61.7`

```bash
spanning-tree mode rapid-pvst
int vlan 25
ip add 10.0.61.7 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWB** — `10.0.61.21`

```bash
spanning-tree mode rapid-pvst
int vlan 25
ip add 10.0.61.21 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWC** — `10.0.61.14`

```bash
spanning-tree mode rapid-pvst
int vlan 25
ip add 10.0.61.14 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

**SWD** — `10.0.61.28`

```bash
spanning-tree mode rapid-pvst
int vlan 25
ip add 10.0.61.28 255.255.255.0
no shut
ex
ip default-gateway 10.0.61.1
```

## 6. Router-on-a-stick en R2 y R3

R2 y R3 conectan con los switches por un enlace troncal. Cada VLAN se representa con una subinterfaz `e0/3.<vlan>` con encapsulación 802.1Q.

**R2**

```bash
en
conf t
ipv6 unicast-routing
int e0/3
no shut
ex
int e0/3.21
ip add 10.0.21.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:A::2/64
enc dot1q 21
ex
int e0/3.22
ip add 10.0.31.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:B::2/64
enc dot1q 22
ex
int e0/3.23
ip add 10.0.41.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C::2/64
enc dot1q 23
ex
int e0/3.24
ip add 10.0.51.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:D::2/64
enc dot1q 24
ex
int e0/3.25
ip add 10.0.61.2 255.255.255.0
ipv6 address 3001:ABCD:ABCD:E::2/64
enc dot1q 25
ex
```

**R3**

```bash
en
conf t
ipv6 unicast-routing
int e0/3
no shut
ex
int e0/3.21
ip add 10.0.21.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:A::3/64
enc dot1q 21
ex
int e0/3.22
ip add 10.0.31.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:B::3/64
enc dot1q 22
ex
int e0/3.23
ip add 10.0.41.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:C::3/64
enc dot1q 23
ex
int e0/3.24
ip add 10.0.51.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:D::3/64
enc dot1q 24
ex
int e0/3.25
ip add 10.0.61.3 255.255.255.0
ipv6 address 3001:ABCD:ABCD:E::3/64
enc dot1q 25
ex
```

## 7. HSRPv2 con gateway en la última IP

El gateway virtual es la **última IP asignable** de cada subred: `.254` en IPv4 y `::FF` en IPv6. R2 es activo para VLAN 21 y 22; R3 es activo para VLAN 23 y 24.

HSRP se configura bajo cada subinterfaz del enlace troncal, que es el punto correcto en un escenario router-on-a-stick.

**R2**

```bash
int e0/3.21
standby version 2
standby 21 ip 10.0.21.254
standby 21 priority 120
standby 21 preempt
standby 211 ipv6 3001:ABCD:ABCD:A::FF/64
standby 211 priority 120
standby 211 preempt
ex
int e0/3.22
standby version 2
standby 22 ip 10.0.31.254
standby 22 priority 120
standby 22 preempt
standby 222 ipv6 3001:ABCD:ABCD:B::FF/64
standby 222 priority 120
standby 222 preempt
ex
int e0/3.23
standby version 2
standby 23 ip 10.0.41.254
standby 23 priority 90
standby 23 preempt
standby 233 ipv6 3001:ABCD:ABCD:C::FF/64
standby 233 priority 90
standby 233 preempt
ex
int e0/3.24
standby version 2
standby 24 ip 10.0.51.254
standby 24 priority 90
standby 24 preempt
standby 244 ipv6 3001:ABCD:ABCD:D::FF/64
standby 244 priority 90
standby 244 preempt
ex
int e0/3.25
standby version 2
standby 25 ip 10.0.61.1
standby 25 priority 120
standby 25 preempt
standby 255 ipv6 3001:ABCD:ABCD:E::1/64
standby 255 priority 120
standby 255 preempt
ex
```

**R3**

```bash
int e0/3.21
standby version 2
standby 21 ip 10.0.21.254
standby 21 priority 90
standby 21 preempt
standby 211 ipv6 3001:ABCD:ABCD:A::FF/64
standby 211 priority 90
standby 211 preempt
ex
int e0/3.22
standby version 2
standby 22 ip 10.0.31.254
standby 22 priority 90
standby 22 preempt
standby 222 ipv6 3001:ABCD:ABCD:B::FF/64
standby 222 priority 90
standby 222 preempt
ex
int e0/3.23
standby version 2
standby 23 ip 10.0.41.254
standby 23 priority 120
standby 23 preempt
standby 233 ipv6 3001:ABCD:ABCD:C::FF/64
standby 233 priority 120
standby 233 preempt
ex
int e0/3.24
standby version 2
standby 24 ip 10.0.51.254
standby 24 priority 120
standby 24 preempt
standby 244 ipv6 3001:ABCD:ABCD:D::FF/64
standby 244 priority 120
standby 244 preempt
ex
int e0/3.25
standby version 2
standby 25 ip 10.0.61.1
standby 25 priority 90
standby 25 preempt
standby 255 ipv6 3001:ABCD:ABCD:E::1/64
standby 255 priority 90
standby 255 preempt
ex
```

## 8. OSPF multiárea y summarización

R2 y R3 son ABR entre el **área 100** (VLANs) y el **área 0** (enlaces hacia R1). Las subinterfaces de las VLANs se marcan como pasivas porque no tienen vecinos OSPF.

**R2**

```bash
router ospf 1
router-id 2.2.2.2
network 2.2.2.2 0.0.0.0 area 100
network 10.0.21.0 0.0.0.255 area 100
network 10.0.31.0 0.0.0.255 area 100
network 10.0.41.0 0.0.0.255 area 100
network 10.0.51.0 0.0.0.255 area 100
network 192.168.12.0 0.0.0.255 area 0
passive-interface e0/3.21
passive-interface e0/3.22
passive-interface e0/3.23
passive-interface e0/3.24
passive-interface loopback 2
area 100 range 10.0.0.0 255.255.192.0
ex
ipv6 router ospf 1
router-id 2.2.2.2
passive-interface e0/3.21
passive-interface e0/3.22
passive-interface e0/3.23
passive-interface e0/3.24
area 100 range 3001:ABCD:ABCD:8::/61
ex
int e0/3.21
ipv6 ospf 1 area 100
ex
int e0/3.22
ipv6 ospf 1 area 100
ex
int e0/3.23
ipv6 ospf 1 area 100
ex
int e0/3.24
ipv6 ospf 1 area 100
ex
int e0/1
ipv6 ospf 1 area 0
ex
```

**R3**

```bash
router ospf 1
router-id 3.3.3.3
network 3.3.3.3 0.0.0.0 area 100
network 10.0.21.0 0.0.0.255 area 100
network 10.0.31.0 0.0.0.255 area 100
network 10.0.41.0 0.0.0.255 area 100
network 10.0.51.0 0.0.0.255 area 100
network 192.168.13.0 0.0.0.255 area 0
passive-interface e0/3.21
passive-interface e0/3.22
passive-interface e0/3.23
passive-interface e0/3.24
passive-interface loopback 3
area 100 range 10.0.0.0 255.255.192.0
ex
ipv6 router ospf 1
router-id 3.3.3.3
passive-interface e0/3.21
passive-interface e0/3.22
passive-interface e0/3.23
passive-interface e0/3.24
area 100 range 3001:ABCD:ABCD:8::/61
ex
int e0/3.21
ipv6 ospf 1 area 100
ex
int e0/3.22
ipv6 ospf 1 area 100
ex
int e0/3.23
ipv6 ospf 1 area 100
ex
int e0/3.24
ipv6 ospf 1 area 100
ex
int e0/2
ipv6 ospf 1 area 0
ex
```

**R1**

```bash
en
conf t
ipv6 unicast-routing
router ospf 1
router-id 1.1.1.1
network 192.168.12.0 0.0.0.255 area 0
network 192.168.13.0 0.0.0.255 area 0
ex
ipv6 router ospf 1
router-id 1.1.1.1
ex
int e0/1
ipv6 ospf 1 area 0
ex
int e0/2
ipv6 ospf 1 area 0
ex
```

Las rutas del área 100 se resumen en `10.0.0.0/18` (VLAN 21 a 24) y `3001:ABCD:ABCD:8::/61` (prefijos `A::` a `D::`) antes de anunciarse al área 0.

## 9. Ruta por defecto y salida a Internet

R1 conoce al ISP por una ruta estática y la inyecta en OSPF.

**R1**

```bash
ip route 0.0.0.0 0.0.0.0 209.50.0.2
ipv6 route ::/0 3001:ABCD:ABCD:209::2
router ospf 1
default-information originate
ex
ipv6 router ospf 1
default-information originate
ex
```

**ISP** — ruta de retorno

```bash
en
conf t
ipv6 unicast-routing
ip route 0.0.0.0 0.0.0.0 209.50.0.1
ipv6 route ::/0 3001:ABCD:ABCD:209::1
```

## 10. VPN site-to-site IPSec entre R2 y R3

La VPN protege el tráfico entre las loopbacks de R2 (`2.2.2.2`) y R3 (`3.3.3.3`). Los peers son las IPs de los enlaces hacia R1: R2 `192.168.12.2` y R3 `192.168.13.3`.

### ISAKMP

**R2**

```bash
crypto isakmp policy 1
authentication pre-share
encryption aes 256
hash sha
group 5
lifetime 3600
ex
crypto isakmp key DUOC address 192.168.13.3
```

**R3**

```bash
crypto isakmp policy 1
authentication pre-share
encryption aes 256
hash sha
group 5
lifetime 3600
ex
crypto isakmp key DUOC address 192.168.12.2
```

### IPSec

**R2**

```bash
crypto ipsec transform-set VPN esp-aes esp-sha-hmac
ex
ip access-list extended VPN
permit ip 2.2.2.2 0.0.0.0 3.3.3.3 0.0.0.0
ex
crypto map MAPA 1 ipsec-isakmp
match address VPN
set peer 192.168.13.3
set transform-set VPN
ex
int e0/1
crypto map MAPA
ex
```

**R3**

```bash
crypto ipsec transform-set VPN esp-aes esp-sha-hmac
ex
ip access-list extended VPN
permit ip 3.3.3.3 0.0.0.0 2.2.2.2 0.0.0.0
ex
crypto map MAPA 1 ipsec-isakmp
match address VPN
set peer 192.168.12.2
set transform-set VPN
ex
int e0/2
crypto map MAPA
ex
```

> **Nota:** la ACL protege solo el tráfico entre loopbacks, que es el caso de prueba del laboratorio. Para una VPN site-to-site real entre las VLANs, agrega también las subredes `10.0.21.0/24` a `10.0.51.0/24` en la ACL.

## 11. DHCP IPv4 e IPv6 en R1

**R1 — DHCP IPv4**

```bash
ip dhcp excluded-address 10.0.21.1 10.0.21.10
ip dhcp excluded-address 10.0.21.254
ip dhcp excluded-address 10.0.31.1 10.0.31.10
ip dhcp excluded-address 10.0.31.254
ip dhcp excluded-address 10.0.41.1 10.0.41.10
ip dhcp excluded-address 10.0.41.254
ip dhcp excluded-address 10.0.51.1 10.0.51.10
ip dhcp excluded-address 10.0.51.254
ip dhcp pool VLAN21
default-router 10.0.21.254
network 10.0.21.0 255.255.255.0
ex
ip dhcp pool VLAN22
default-router 10.0.31.254
network 10.0.31.0 255.255.255.0
ex
ip dhcp pool VLAN23
default-router 10.0.41.254
network 10.0.41.0 255.255.255.0
ex
ip dhcp pool VLAN24
default-router 10.0.51.254
network 10.0.51.0 255.255.255.0
ex
```

**R2 y R3 — relay DHCP**

```bash
! R2
int e0/3.21
ip helper-address 192.168.12.1
ex
int e0/3.22
ip helper-address 192.168.12.1
ex
int e0/3.23
ip helper-address 192.168.12.1
ex
int e0/3.24
ip helper-address 192.168.12.1
ex

! R3
int e0/3.21
ip helper-address 192.168.13.1
ex
int e0/3.22
ip helper-address 192.168.13.1
ex
int e0/3.23
ip helper-address 192.168.13.1
ex
int e0/3.24
ip helper-address 192.168.13.1
ex
```

**R1 — DHCPv6**

```bash
ipv6 dhcp pool VLAN21-V6
add prefix 3001:ABCD:ABCD:A::/64
ex
int e0/1
ipv6 dhcp server VLAN21-V6
ex
int e0/2
ipv6 dhcp server VLAN21-V6
ex
```

**R2 y R3 — relay DHCPv6**

```bash
! R2
int e0/3.21
ipv6 nd other-config-flag
ipv6 dhcp relay destination 3001:ABCD:ABCD:12::1
ex

! R3
int e0/3.21
ipv6 nd other-config-flag
ipv6 dhcp relay destination 3001:ABCD:ABCD:13::1
ex
```

## 12. MP-BGP con el ISP y BR

R1 (AS 100) forma eBGP con el ISP (AS 200), y el ISP forma eBGP con BR (AS 300). Las loopbacks se anuncian como prefijos.

**R1**

```bash
router bgp 100
bgp router-id 1.1.1.1
address-family ipv4
network 1.1.1.1 mask 255.255.255.255
neighbor 209.50.0.2 remote-as 200
ex
address-family ipv6
network 3001:ABCD:ABCD:1::1/128
neighbor 3001:ABCD:ABCD:209::2 remote-as 200
ex
```

**ISP**

```bash
router bgp 200
bgp router-id 8.8.8.8
address-family ipv4
neighbor 209.50.0.1 remote-as 100
neighbor 220.50.0.1 remote-as 300
network 8.8.8.8 mask 255.255.255.255
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:209::1 remote-as 100
neighbor 3001:ABCD:ABCD:220::1 remote-as 300
network 3001:ABCD:ABCD:8::8/128
ex
```

**BR**

```bash
router bgp 300
bgp router-id 192.168.100.1
address-family ipv4
neighbor 220.50.0.2 remote-as 200
network 192.168.100.1 mask 255.255.255.255
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:220::2 remote-as 200
network 3001:ABCD:ABCD:100::1/128
ex
```

### Influir en el AS_PATH del enlace ISP-BR

El ISP antepone su propio AS al anunciar hacia BR: dos veces en IPv4 y tres veces en IPv6. Así el path que ve BR muestra `200 200` o `200 200 200`.

**ISP**

```bash
route-map PREPEND-V4 permit
set as-path prepend 200 200
ex
route-map PREPEND-V6 permit
set as-path prepend 200 200 200
ex
router bgp 200
address-family ipv4
neighbor 220.50.0.1 route-map PREPEND-V4 out
ex
address-family ipv6
neighbor 3001:ABCD:ABCD:220::1 route-map PREPEND-V6 out
ex
```

## 13. Redistribución IGP ↔ EGP

### IPv4: con route-maps

**OSPF → BGP**

```bash
ip prefix-list RUTAS-OSPF permit 10.0.0.0/18
ip prefix-list RUTAS-OSPF permit 192.168.12.0/24
ip prefix-list RUTAS-OSPF permit 192.168.13.0/24
route-map BGP permit
match ip address prefix-list RUTAS-OSPF
set metric 50
ex
router bgp 100
address-family ipv4
redistribute ospf 1 route-map BGP
ex
```

**BGP → OSPF**

```bash
ip prefix-list RUTAS-BGP permit 209.50.0.0/30
ip prefix-list RUTAS-BGP permit 220.50.0.0/30
ip prefix-list RUTAS-BGP permit 8.8.8.8/32
ip prefix-list RUTAS-BGP permit 192.168.100.1/32
route-map OSPF permit
match ip address prefix-list RUTAS-BGP
set metric 50
ex
router ospf 1
redistribute bgp 100 route-map OSPF subnets
ex
```

### IPv6: directa

```bash
ipv6 router ospf 1
redistribute bgp 100 include-connected
ex
router bgp 100
address-family ipv6
redistribute ospf 1 include-connected
ex
```

## Verificación

- **Capa 2**
  - `show vlan brief` — VLAN 21-25.
  - `show etherchannel summary` — Po1-Po6 en `SU`/`P`.
  - `show spanning-tree` — Rapid PVST+ activo.
  - `show port-security` — máximo 2 MAC y modo `Shutdown`.
- **HSRP**
  - `show standby brief` — R2 activo en VLAN 21/22 y R3 activo en VLAN 23/24.
  - `show standby` — VIP `.254` y `::FF`.
- **OSPF**
  - `show ip ospf neighbor` — vecindades en área 0 y área 100.
  - `show ip ospf database summary` — LSAs de resumen del área 100.
  - `show ip route` — ruta sumarizada `10.0.0.0/18`.
  - `show ipv6 route` — `3001:ABCD:ABCD:8::/61`.
- **VPN**
  - `show crypto isakmp sa` — fase 1 en `QM_IDLE`/`MM_ACTIVE`.
  - `show crypto ipsec sa` — fase 2 con contadores de encapsulado/desencapsulado.
  - `ping 3.3.3.3 source 2.2.2.2` desde R2 — debe ir por el túnel.
  - `show crypto map` — crypto map aplicado a la interfaz.
- **DHCP**
  - `show ip dhcp binding` en R1.
  - `show ipv6 dhcp binding`.
  - En los PC, la IP y el gateway deben coincidir con la VIP de HSRP.
- **BGP**
  - `show ip bgp summary` — sesiones con AS 200 y AS 300.
  - `show ip bgp` — path con `200 200` en IPv4 y `200 200 200` en IPv6.
  - `show ip bgp neighbors 220.50.0.1` — route-map de salida aplicado.
- **Conectividad**
  - `ping` entre PC de VLAN 21 y PC de VLAN 24.
  - `ping 8.8.8.8` y `ping 192.168.100.1`.
  - `traceroute` para confirmar el path R2/R3 → R1 → ISP → BR.

# Conclusión

El laboratorio integra una red de campus redundante con una VPN site-to-site IPSec, alta disponibilidad HSRP, OSPF multiárea con summarización, DHCP centralizado y BGP con manipulación de AS_PATH.

Los puntos críticos al reproducirlo son: aplicar HSRP en las subinterfaces correctas, igualar las ACL de la VPN en ambos extremos (incluyendo el reflejo de origen y destino), asegurar que el tráfico entre peers sea alcanzable antes de aplicar el crypto map, y que la summarización del área 100 cubra exactamente las VLANs anunciadas.
