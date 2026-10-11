# Выпуск KinoWatch для Samsung

Это порядок выпуска Samsung Tizen порта. Исторические `homebrew/` и
`webos-meta/` унаследованы из KPuppy; Samsung релиз не использует LG IPK
и не обновляет feed или репозиторий darkpal/KPuppy.

## Подготовка

1. Для нового выпуска обновите версию в `package.json`, `package-lock.json`
   и пользовательской документации. Первому Samsung выпуску соответствует 0.2.2.
2. Выполните `npm.cmd ci`, `npm.cmd run test:run` и `git diff --check`.
3. На Windows выполните `npm.cmd run release:prepare`.

Последняя команда запускает production build с отключённой диагностикой и
создаёт в `artifacts`:

- `KinoWatch-0.2.2-build.zip` — готовый `dist`, инструкции и скрипты подписи/установки;
- `KinoWatch-0.2.2-build.zip.sha256` — контрольная сумма.

Архив не содержит подписи и сертификатов владельца. Каждый пользователь
подписывает его своим Samsung TV профилем с DUID своего телевизора.
Скрипты устанавливают только пакет `KinoWatch1`; системные настройки ТВ
не меняются автоматически.

## Публикация репозитория

Создайте отдельный репозиторий под своим аккаунтом, например
`YOUR_ACCOUNT/KinoWatch-Samsung`. Укажите источник KPuppy и сохраните LICENSE.
Перед отправкой просмотрите `git status` и исключения `.gitignore`.

Не отправляйте изменения в существующий `origin`, если он указывает на
darkpal/KPuppy. Добавьте отдельный remote к своему новому репозиторию.
Сохраняйте Git-историю исходного проекта; Samsung изменения оформляйте
отдельным коммитом. Публичная выкладка требует решения владельца проекта.

GitHub Actions из `.github/workflows/ci.yml` запускает тесты, сборку и
подготовку ZIP. Он загружает только архив сборки и SHA256 как CI artifacts;
GitHub Release автоматически не публикуется. Подпись и Samsung сертификаты
для CI не требуются.

## Первый GitHub Release

После публикации исходников и успешного CI:

1. Откройте Releases → Draft a new release.
2. Создайте тег `v0.2.2` на коммите с Samsung портом.
3. Название: `KinoWatch 0.2.2 — Samsung Tizen preview`.
4. Используйте текст из [RELEASE_NOTES_0.2.2.md](RELEASE_NOTES_0.2.2.md).
5. Прикрепите `KinoWatch-0.2.2-build.zip` и файл `.sha256`.
6. Отметьте **Set as a pre-release**: проверена одна модель, совместимость
   всех файлов и длительный просмотр пока не подтверждены.
7. Опубликуйте и проверьте скачивание ZIP, его SHA256 и наличие инструкций.

Локальный `artifacts/KinoWatch.wgt`, подписанный для тестового телевизора,
не прикладывается как универсальный установщик. Private keys, `.p12`, `.pfx`,
profiles.xml и персональные токены не публикуются.

## Проверка содержимого архива

Внутри должны быть `dist/config.xml`, `dist/index.html`, assets, иконка,
LICENSE, THIRD_PARTY_NOTICES и лицензии зависимостей, а также
`scripts/package-tizen.ps1`, `scripts/install-tizen.ps1` и `docs/INSTALL.md`.
В `dist` не должно быть author-signature.xml или signature*.xml.

На Windows можно проверить сумму:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\KinoWatch-0.2.2-build.zip
```

Сравните её с опубликованным `.sha256`. Проверка checksum подтверждает
целостность скачанного архива; работоспособность на новой модели проверяется
отдельно и заносится в [COMPATIBILITY.md](COMPATIBILITY.md).
