CREATE TABLE `company_products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int,
	`owner_open_id` varchar(64),
	`name` varchar(80) NOT NULL,
	`template` varchar(30) NOT NULL DEFAULT 'generico',
	`color` varchar(7),
	`config` mediumtext NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`owner_open_id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`document` varchar(32),
	`phone` varchar(40),
	`email` varchar(320),
	`birth_date` date,
	`address` varchar(200),
	`district` varchar(100),
	`city` varchar(100),
	`state` varchar(40),
	`zip` varchar(16),
	`notes` text,
	`custom_fields` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`owner_open_id` varchar(64) NOT NULL,
	`prefs` text,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_settings_owner_open_id` PRIMARY KEY(`owner_open_id`)
);
--> statement-breakpoint
ALTER TABLE `client_records` MODIFY COLUMN `objection` varchar(40);--> statement-breakpoint
ALTER TABLE `client_records` MODIFY COLUMN `stage` varchar(40) NOT NULL DEFAULT 'new';--> statement-breakpoint
ALTER TABLE `agencies` ADD `product_id` int;--> statement-breakpoint
ALTER TABLE `client_records` ADD `product_id` int;--> statement-breakpoint
ALTER TABLE `client_records` ADD `customer_id` int;--> statement-breakpoint
ALTER TABLE `client_records` ADD `custom_fields` text;--> statement-breakpoint
ALTER TABLE `company_settings` ADD `prefs` text;--> statement-breakpoint
CREATE INDEX `company_products_company_idx` ON `company_products` (`company_id`);--> statement-breakpoint
CREATE INDEX `company_products_owner_idx` ON `company_products` (`owner_open_id`);--> statement-breakpoint
CREATE INDEX `customers_owner_idx` ON `customers` (`owner_open_id`);--> statement-breakpoint
INSERT INTO `company_products` (`company_id`, `owner_open_id`, `name`, `template`, `color`, `config`, `sort_order`)
SELECT `id`, NULL, 'Crédito bancário', 'credito', '#0b3a8a', '{"stages":[{"key":"new","label":"Novo atendimento","color":"slate","kind":"open"},{"key":"contacted","label":"Em atendimento","color":"blue","kind":"open"},{"key":"negotiation","label":"Em negociação","color":"violet","kind":"open"},{"key":"awaiting_limit","label":"Aguardando limite","color":"amber","kind":"open"},{"key":"technical","label":"Caso técnico","color":"orange","kind":"handoff"},{"key":"sold","label":"Venda realizada","color":"emerald","kind":"won"},{"key":"lost","label":"Não fechou","color":"rose","kind":"lost"}],"fields":[{"key":"limite","label":"Limite de crédito disponível","type":"select","options":["Sim, tem limite","Não tem limite","Ainda não verificado"],"showOnCard":true},{"key":"cliente_banco","label":"Já é cliente do banco?","type":"select","options":["Sim, já é cliente","Ainda não é cliente","Não informado"],"showOnCard":true},{"key":"interesse_sem_limite","label":"Tem interesse, mas está sem limite","type":"yesno","showOnCard":true},{"key":"classe","label":"Classe do produto","type":"select","options":["Empréstimo consignado","Empréstimo pessoal","Cartão consignado / saque","Refinanciamento / portabilidade","Outros"]}],"reasons":[{"key":"no_limit","label":"Sem limite disponível"},{"key":"rate","label":"Taxa de juros"},{"key":"installment","label":"Valor da parcela"},{"key":"thinking","label":"Vai pensar","callback":true},{"key":"no_interest","label":"Sem interesse no momento"},{"key":"documents","label":"Documentação"},{"key":"later","label":"Retornar em outro momento","callback":true},{"key":"unreachable","label":"Não conseguiu contato"},{"key":"other","label":"Outro motivo"}],"items":["Consignado INSS","Consignado público","Empréstimo pessoal","Cartão consignado","Saque complementar","Portabilidade","Refinanciamento"],"itemLabel":"Último produto vendido"}', 0 FROM `companies`;--> statement-breakpoint
UPDATE `agencies` a JOIN `company_products` p ON p.`company_id` = a.`company_id` SET a.`product_id` = p.`id`;--> statement-breakpoint
INSERT INTO `company_products` (`company_id`, `owner_open_id`, `name`, `template`, `color`, `config`, `sort_order`)
SELECT DISTINCT NULL, r.`owner_open_id`, 'Crédito bancário', 'credito', '#0b3a8a', '{"stages":[{"key":"new","label":"Novo atendimento","color":"slate","kind":"open"},{"key":"contacted","label":"Em atendimento","color":"blue","kind":"open"},{"key":"negotiation","label":"Em negociação","color":"violet","kind":"open"},{"key":"awaiting_limit","label":"Aguardando limite","color":"amber","kind":"open"},{"key":"technical","label":"Caso técnico","color":"orange","kind":"handoff"},{"key":"sold","label":"Venda realizada","color":"emerald","kind":"won"},{"key":"lost","label":"Não fechou","color":"rose","kind":"lost"}],"fields":[{"key":"limite","label":"Limite de crédito disponível","type":"select","options":["Sim, tem limite","Não tem limite","Ainda não verificado"],"showOnCard":true},{"key":"cliente_banco","label":"Já é cliente do banco?","type":"select","options":["Sim, já é cliente","Ainda não é cliente","Não informado"],"showOnCard":true},{"key":"interesse_sem_limite","label":"Tem interesse, mas está sem limite","type":"yesno","showOnCard":true},{"key":"classe","label":"Classe do produto","type":"select","options":["Empréstimo consignado","Empréstimo pessoal","Cartão consignado / saque","Refinanciamento / portabilidade","Outros"]}],"reasons":[{"key":"no_limit","label":"Sem limite disponível"},{"key":"rate","label":"Taxa de juros"},{"key":"installment","label":"Valor da parcela"},{"key":"thinking","label":"Vai pensar","callback":true},{"key":"no_interest","label":"Sem interesse no momento"},{"key":"documents","label":"Documentação"},{"key":"later","label":"Retornar em outro momento","callback":true},{"key":"unreachable","label":"Não conseguiu contato"},{"key":"other","label":"Outro motivo"}],"items":["Consignado INSS","Consignado público","Empréstimo pessoal","Cartão consignado","Saque complementar","Portabilidade","Refinanciamento"],"itemLabel":"Último produto vendido"}', 0
FROM `client_records` r LEFT JOIN `company_members` m ON m.`user_open_id` = r.`owner_open_id` WHERE m.`id` IS NULL;--> statement-breakpoint
UPDATE `client_records` r JOIN `company_members` m ON m.`user_open_id` = r.`owner_open_id` JOIN `company_products` p ON p.`company_id` = m.`company_id` SET r.`product_id` = p.`id`;--> statement-breakpoint
UPDATE `client_records` r JOIN `company_products` p ON p.`owner_open_id` = r.`owner_open_id` SET r.`product_id` = p.`id` WHERE r.`product_id` IS NULL;--> statement-breakpoint
UPDATE `client_records` SET `custom_fields` = JSON_OBJECT(
  'limite', CASE `has_credit_limit` WHEN 'yes' THEN 'Sim, tem limite' WHEN 'no' THEN 'Não tem limite' ELSE '' END,
  'cliente_banco', CASE `is_bank_customer` WHEN 'yes' THEN 'Sim, já é cliente' WHEN 'no' THEN 'Ainda não é cliente' ELSE '' END,
  'interesse_sem_limite', IF(`interested_without_limit`, 'sim', ''),
  'classe', CASE `product_class` WHEN 'consignado' THEN 'Empréstimo consignado' WHEN 'pessoal' THEN 'Empréstimo pessoal' WHEN 'cartao_consignado' THEN 'Cartão consignado / saque' WHEN 'refinanciamento' THEN 'Refinanciamento / portabilidade' WHEN 'outros' THEN 'Outros' ELSE '' END
);
