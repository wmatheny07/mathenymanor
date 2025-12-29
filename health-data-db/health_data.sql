CREATE TABLE public.health_test (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT ab_permission_name_uq UNIQUE (name),
	CONSTRAINT ab_permission_pkey PRIMARY KEY (id)
);

commit;