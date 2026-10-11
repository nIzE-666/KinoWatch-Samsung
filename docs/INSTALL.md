# Установка KinoWatch на Samsung

Инструкция предназначена для Windows и потребительских Samsung Smart TV.
Проверена установка на UE43TU7090UXRU с Tizen 5.5. Другие модели с Tizen 5.5+
ещё требуют проверки. На LG, Android TV и старые Samsung Orsay этот пакет
не устанавливается.

Компьютер нужен для подготовки, подписи и установки. После этого просмотр
выполняется на ТВ, а вход проходит по коду через собственный аккаунт сервиса.

## 1. Подготовить компьютер

Установите Tizen Studio с инструментами CLI, Device Manager и Certificate
Manager. В Package Manager установите **Samsung TV Extensions** и
**Samsung Certificate Extension**. Запомните каталог SDK; ниже используется
пример `C:\tizen-studio`.

Samsung указывает, что для создания сертификатов после сентября 2025 года
Certificate Extension должна быть версии 2.0.73 или новее.
[Установка SDK](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).

Для сборки из исходников дополнительно установите Node.js 22+ с npm.
Для готового архива `KinoWatch-0.2.2-build.zip` Node.js не требуется.

## 2. Включить Developer Mode на телевизоре

1. Подключите ТВ и компьютер к одной локальной сети.
2. Узнайте IPv4 компьютера командой `ipconfig`, а IPv4 ТВ — в его настройках
   сети. Это два разных адреса.
3. На ТВ откройте Apps. На моделях с отдельной страницей App Settings
   перейдите на неё. Наберите `12345` пультом или экранной цифровой клавиатурой.
4. Включите Developer Mode и укажите **IP компьютера** в поле Host PC IP.
5. Перезагрузите ТВ.

Расположение панели зависит от модели. Если она не открывается, сверяйтесь
с [официальной инструкцией Samsung](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).

## 3. Подключиться и создать свой сертификат

1. Откройте Device Manager, добавьте телевизор по его IP и подключитесь.
2. В Certificate Manager выберите создание профиля **Samsung → TV**.
   Назовите профиль, например, `KinoWatch`.
3. Создайте author certificate или выберите существующий. Вход в Samsung
   выполняйте в окне Certificate Manager.
4. Создайте distributor certificate и добавьте **DUID своего телевизора**.
   Подключённое устройство можно выбрать в мастере сертификатов.
5. В Device Manager выполните **Permit to install applications**, если этот
   пункт предлагается для устройства.

Сохраните author certificate и его пароль у себя: обновления приложения
нужно подписывать тем же author certificate. Сертификат другого владельца
может не разрешать установку на ваш ТВ.
[Сертификаты Samsung](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

## 4. Подготовить приложение

### Вариант A: готовая сборка

На странице [Releases](https://github.com/nIzE-666/KinoWatch-Samsung/releases)
скачайте `KinoWatch-0.2.2-build.zip` и
распакуйте его. Откройте PowerShell в распакованном каталоге, где находятся
`dist`, `scripts` и `README.md`. Подпишите сборку своим профилем:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-tizen.ps1 -SdkRoot C:\tizen-studio -Profile KinoWatch -SkipBuild
```

Замените каталог SDK и имя профиля своими значениями. `-SkipBuild` использует
готовый `dist` из архива и не запускает Node.js. ZIP сам по себе не
устанавливается на ТВ; скрипт создаёт подписанный `.wgt`.

### Вариант B: исходники

Скачайте ZIP [репозитория](https://github.com/nIzE-666/KinoWatch-Samsung)
через Code → Download ZIP или клонируйте его.
Распакуйте и откройте PowerShell в корне проекта:

```powershell
npm.cmd ci
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-tizen.ps1 -SdkRoot C:\tizen-studio -Profile KinoWatch
```

В обоих вариантах результат — `artifacts\KinoWatch.wgt`.

## 5. Установить и запустить

В следующем примере **`192.168.1.50` нужно заменить IP телевизора**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-tizen.ps1 -SdkRoot C:\tizen-studio -TvAddress 192.168.1.50
```

Скрипт подключится по SDB, установит пакет и запустит приложение. Для
установки без запуска добавьте `-NoRun`. Можно открыть KinoWatch вручную
в Apps. Первичная активация описана в [USAGE.md](USAGE.md).

Скрипты также понимают переменные PowerShell `KINOWATCH_SDK_ROOT`,
`KINOWATCH_CERT_PROFILE` и `KINOWATCH_TV_ADDRESS`. Параметры команд имеют
приоритет над ними. IP или профиль другого владельца не используются
автоматически.

## Обновление

Скачайте новый архив или исходники, подпишите **тем же author certificate**
и установите поверх старой версии. ID приложения — `KinoWatch1.App`,
ID пакета — `KinoWatch1`. Удаление приложения может стереть вход и настройки.
[Требование одинакового сертификата](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).

## Если установка не получилась

| Сообщение / симптом | Что проверить |
| --- | --- |
| Tizen SDK not found | Путь `-SdkRoot`, наличие `tools\ide\bin\tizen.bat` и `tools\sdb.exe` |
| Pass -Profile | Имя Samsung TV профиля в Certificate Manager |
| TV unavailable | Developer Mode, Host PC IP, IP телевизора, локальную сеть и доступ SDB |
| Packaging failed | Samsung TV сертификат, корректный профиль, инструменты SDK |
| Installation failed | DUID ТВ в distributor certificate и Permit to install applications |
| Installed, but launch not confirmed | Открыть KinoWatch вручную из Apps |
| Видео не запускается | [Известные ограничения](COMPATIBILITY.md); это отдельный этап после установки |

Приложение не публикуется в Samsung Apps этой инструкцией. Установка
через USB или запуск APK этим проектом не предусмотрены.
